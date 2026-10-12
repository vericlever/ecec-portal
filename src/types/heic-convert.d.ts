declare module "heic-convert" {
  type ConvertOptions = {
    buffer: Buffer;
    format: "PNG" | "JPEG";
    quality?: number;
  };
  function convert(opts: ConvertOptions): Promise<Buffer>;
  export default convert;
}
