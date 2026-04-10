import fs from "node:fs/promises";

export type VisionImage =
  | { content: string }
  | { source: { imageUri: string } };

const MAX_FILE_BYTES = 7 * 1024 * 1024;

export async function resolveImageSource(args: {
  filePath?: string;
  imageUrl?: string;
}): Promise<VisionImage> {
  if (args.imageUrl) {
    return { source: { imageUri: args.imageUrl } };
  }

  if (!args.filePath) {
    throw new Error("resolveImageSource requires filePath or imageUrl");
  }

  const absPath = args.filePath;

  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`File not found: ${absPath}`);
    }
    throw new Error(
      `Cannot read file ${absPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (!stat.isFile()) {
    throw new Error(`Not a regular file: ${absPath}`);
  }

  if (stat.size > MAX_FILE_BYTES) {
    const mb = (stat.size / 1_000_000).toFixed(1);
    throw new Error(
      `Image is ${mb} MB; Vision limit is ~7 MB after base64 encoding. ` +
        `Resize the image first, e.g.: ffmpeg -i "${absPath}" -vf scale=2000:-1 resized.jpg`
    );
  }

  const buffer = await fs.readFile(absPath);

  detectUnsupportedFormat(buffer, absPath);

  return { content: buffer.toString("base64") };
}

function detectUnsupportedFormat(buffer: Buffer, absPath: string): void {
  // SVG: text-based, starts with <?xml or <svg (possibly after whitespace)
  const head = buffer.slice(0, 512).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg")) {
    throw new Error(
      `SVG images are not supported by Google Cloud Vision (file: ${absPath}). Convert to PNG or JPEG first.`
    );
  }

  // HEIC/HEIF: ISO Base Media container. Bytes 4..8 == "ftyp", bytes 8..12 in {heic,heix,mif1,msf1,hevc,hevx}
  if (buffer.length >= 12) {
    const ftyp = buffer.slice(4, 8).toString("ascii");
    if (ftyp === "ftyp") {
      const brand = buffer.slice(8, 12).toString("ascii");
      const heicBrands = new Set([
        "heic",
        "heix",
        "mif1",
        "msf1",
        "hevc",
        "hevx",
      ]);
      if (heicBrands.has(brand)) {
        throw new Error(
          `HEIC/HEIF images are not supported by Google Cloud Vision (file: ${absPath}). ` +
            `Convert to JPEG first (on Windows: open in Photos app, then "Save as" JPEG).`
        );
      }
    }
  }
}
