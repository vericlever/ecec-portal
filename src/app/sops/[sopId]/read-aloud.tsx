"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Status = "idle" | "playing" | "paused";

// Prefer an Australian English voice, then British, then any English, then
// whatever the device defaults to. The Web Speech API can only use voices the
// device already has: most Apple devices and many Android phones carry an
// en-AU voice; a lot of Windows machines only have US English unless the
// Australian language pack is installed, so this degrades gracefully.
function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const en = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  const byLang = (code: string) =>
    en.find((v) => v.lang?.toLowerCase() === code);
  return (
    byLang("en-au") ??
    en.find((v) => /austral/i.test(v.name)) ??
    byLang("en-gb") ??
    en.find((v) => v.default) ??
    en[0] ??
    null
  );
}

// Browser-native read-aloud (Web Speech API). No audio is generated or stored;
// the device speaks the text live. The SOP body is split into short chunks so a
// long procedure keeps going past Chrome's ~15 second per-utterance limit, and
// so pause/resume lands cleanly between sentences.
export function ReadAloud({ text }: { text: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [supported, setSupported] = useState(true);
  const chunks = useRef<string[]>([]);
  const index = useRef(0);
  const stopped = useRef(false);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        "speechSynthesis" in window &&
        typeof window.SpeechSynthesisUtterance === "function",
    );
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speakNext = useCallback(() => {
    if (stopped.current) return;
    const synth = window.speechSynthesis;
    if (index.current >= chunks.current.length) {
      setStatus("idle");
      index.current = 0;
      return;
    }
    const u = new SpeechSynthesisUtterance(chunks.current[index.current]);
    const voice = pickVoice(synth.getVoices());
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = "en-AU";
    }
    u.onend = () => {
      if (stopped.current) return;
      index.current += 1;
      speakNext();
    };
    u.onerror = () => {
      stopped.current = true;
      setStatus("idle");
    };
    synth.speak(u);
    setStatus("playing");
  }, []);

  function start() {
    const synth = window.speechSynthesis;
    synth.cancel();
    chunks.current = text
      .split(/(?<=[.!?:])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    index.current = 0;
    stopped.current = false;
    if (chunks.current.length === 0) return;
    speakNext();
  }

  function onClick() {
    if (!supported) return;
    if (status === "idle") {
      start();
    } else if (status === "playing") {
      window.speechSynthesis.pause();
      setStatus("paused");
    } else {
      window.speechSynthesis.resume();
      setStatus("playing");
    }
  }

  function stop() {
    stopped.current = true;
    window.speechSynthesis.cancel();
    index.current = 0;
    setStatus("idle");
  }

  if (!supported) return null;

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        aria-live="polite"
      >
        {status === "idle" && (
          <>
            <PlayIcon /> Listen
          </>
        )}
        {status === "playing" && (
          <>
            <PauseIcon /> Pause
          </>
        )}
        {status === "paused" && (
          <>
            <PlayIcon /> Resume
          </>
        )}
      </button>
      {status !== "idle" && (
        <button
          type="button"
          onClick={stop}
          className="text-xs text-slate-400 underline hover:text-slate-700"
        >
          Stop
        </button>
      )}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M4 3l9 5-9 5V3z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <rect x="3" y="3" width="4" height="10" fill="currentColor" />
      <rect x="9" y="3" width="4" height="10" fill="currentColor" />
    </svg>
  );
}
