"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";

// Step 57, A4. A canvas signature pad - mouse, finger and stylus via pointer
// events, touch-action: none so a finger stroke doesn't also scroll the
// page. Hand-rolled rather than the signature_pad npm package, matching
// this project's preference for a lean dependency footprint (unpdf over a
// heavier PDF lib, Voyage as plain REST instead of an SDK) for something
// this small.
export type SignaturePadHandle = {
  // null if nothing has been drawn yet - the caller (sign-form) uses this to
  // require a real signature before enabling Sign, not just an empty pad.
  getDataUrl: () => string | null;
  clear: () => void;
};

const STROKE_COLOR = "#1a1a17"; // matches --color-ink
const STROKE_WIDTH = 2.5;

export const SignaturePad = forwardRef<
  SignaturePadHandle,
  { className?: string; onStrokeChange?: (hasStrokes: boolean) => void }
>(function SignaturePad({ className, onStrokeChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const [hasStrokes, setHasStrokes] = useState(false);

    function context(): CanvasRenderingContext2D | null {
      return canvasRef.current?.getContext("2d") ?? null;
    }

    // The canvas backing store is sized in device pixels (for crisp lines on
    // a high-DPI phone screen) while CSS sizes it in logical pixels - every
    // pointer coordinate has to be converted through that same ratio.
    function point(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    }

    function start(e: React.PointerEvent<HTMLCanvasElement>) {
      const ctx = context();
      if (!ctx) return;
      drawing.current = true;
      const { x, y } = point(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      canvasRef.current?.setPointerCapture(e.pointerId);
    }

    function move(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawing.current) return;
      const ctx = context();
      if (!ctx) return;
      const { x, y } = point(e);
      ctx.strokeStyle = STROKE_COLOR;
      ctx.lineWidth = STROKE_WIDTH;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineTo(x, y);
      ctx.stroke();
      if (!hasStrokes) {
        setHasStrokes(true);
        onStrokeChange?.(true);
      }
    }

    function end() {
      drawing.current = false;
    }

    function clear() {
      const canvas = canvasRef.current;
      const ctx = context();
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasStrokes(false);
      onStrokeChange?.(false);
    }

    // Crops to the drawn strokes' bounding box rather than exporting the
    // whole (mostly transparent) pad, so the signature sits tightly on the
    // execution page instead of floating in a large blank rectangle.
    function getDataUrl(): string | null {
      const canvas = canvasRef.current;
      if (!canvas || !hasStrokes) return null;
      const ctx = context();
      if (!ctx) return null;

      const { width, height } = canvas;
      const data = ctx.getImageData(0, 0, width, height).data;
      let minX = width, minY = height, maxX = 0, maxY = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const alpha = data[(y * width + x) * 4 + 3];
          if (alpha > 0) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < minX || maxY < minY) return null;

      const pad = 6;
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(width - 1, maxX + pad);
      maxY = Math.min(height - 1, maxY + pad);

      const trimmed = document.createElement("canvas");
      trimmed.width = maxX - minX + 1;
      trimmed.height = maxY - minY + 1;
      const tctx = trimmed.getContext("2d");
      if (!tctx) return null;
      tctx.drawImage(canvas, minX, minY, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
      return trimmed.toDataURL("image/png");
    }

    useImperativeHandle(ref, () => ({ getDataUrl, clear }));

    return (
      <div className={className}>
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          style={{ touchAction: "none" }}
          className="w-full cursor-crosshair rounded-md border border-slate-300 bg-white"
        />
        <button
          type="button"
          onClick={clear}
          className="mt-1.5 text-xs text-slate-500 underline hover:text-slate-700"
        >
          Clear
        </button>
      </div>
    );
  },
);
