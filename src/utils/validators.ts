import path from "node:path";

export function validateFilePath(filePath: string): string {
  const trimmed = filePath.trim();
  if (!trimmed) {
    throw new Error("file_path must not be empty");
  }
  return path.resolve(trimmed);
}

export function validateImageUrl(imageUrl: string): string {
  const trimmed = imageUrl.trim();
  if (!trimmed) {
    throw new Error("image_url must not be empty");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid image_url: "${imageUrl}" is not a valid URL.`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(
      `image_url must use HTTPS (got "${parsed.protocol}"). Google Cloud Vision requires HTTPS for imageUri.`
    );
  }
  return trimmed;
}

export function validateMaxResults(max: number): number {
  if (!Number.isInteger(max) || max < 1 || max > 50) {
    throw new Error("max_results must be an integer between 1 and 50");
  }
  return max;
}

export function getVisionApiKey(): string {
  const key = (process.env.GOOGLE_VISION_API_KEY ?? "").trim();
  if (!key) {
    throw new Error(
      "GOOGLE_VISION_API_KEY environment variable is required. " +
        "Create a key at https://console.cloud.google.com/apis/credentials and enable the Cloud Vision API on your GCP project."
    );
  }
  return key;
}
