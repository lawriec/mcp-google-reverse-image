# mcp-google-reverse-image

MCP server for **reverse image search** via Google Cloud Vision's [Web Detection](https://cloud.google.com/vision/docs/detecting-web) API. Give it a local image file or a public HTTPS image URL; get back the pages on the web where the image appears, exact and partial matches, visually similar images, Google's best-guess label, and detected web entities — all from Google's live image index.

This is the real thing, not text-matching on URLs: Vision's Web Detection is the same backend that powers Google Images' reverse search UI, exposed as a REST API.

## Prerequisites

- **Node.js 18+**
- **Google Cloud account** with billing enabled (required even for the free tier)

## Google Cloud API key setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create or select a project.
2. Enable billing on the project: **Billing** → link a billing account. This is required even to use the free tier.
3. Enable the Cloud Vision API: **APIs & Services** → **Library** → search "Cloud Vision API" → **Enable**.
4. Create an API key: **APIs & Services** → **Credentials** → **Create credentials** → **API key**.
5. **Restrict the key** (recommended): click the key → **API restrictions** → **Restrict key** → select **Cloud Vision API** only.
6. Leave **Application restrictions** at **None** or **IP addresses**. Do NOT use **HTTP referrers** — stdio MCP servers send no referrer and your calls will be rejected.
7. Copy the `AIza…` string and set it as `GOOGLE_VISION_API_KEY` in your MCP client config.

## Pricing

- **Free tier: 1000 Web Detection calls per month**, every month.
- Beyond that: **$3.50 per 1000 calls**.
- See [Cloud Vision pricing](https://cloud.google.com/vision/pricing) for the full breakdown.

Billing must still be enabled on the project even if you stay entirely within the free tier.

## Installation

Add to your MCP client config (e.g. `.mcp.json`):

```json
{
  "mcpServers": {
    "google-reverse-image": {
      "command": "npx",
      "args": ["-y", "github:lawriec/mcp-google-reverse-image"],
      "env": {
        "GOOGLE_VISION_API_KEY": "AIza..."
      }
    }
  }
}
```

The `prepare` script builds the TypeScript on install, so the first launch is slightly slower while `tsc` runs. Subsequent launches are instant.

## Tool reference

### `reverse_image_search`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file_path` | string | one of | Absolute path to a local image file. Max 7 MB. |
| `image_url` | string | one of | Public HTTPS URL of an image. Google fetches it server-side. |
| `max_results` | number | no | Max items shown per result section. Default 20, range 1-50. |

**Exactly one** of `file_path` or `image_url` must be provided.

Example output:

```
Reverse image search results for: Mona_Lisa.jpg

Best guess: "Mona Lisa"

Summary: 4 exact match(es), 18 partial match(es), 52 page(s), 20 similar, 12 entities.

Pages containing this image (showing 20 of 52):
- https://en.wikipedia.org/wiki/Mona_Lisa — "Mona Lisa - Wikipedia"
- https://www.louvre.fr/en/explore/the-palace/mona-lisa — "Mona Lisa | Louvre Museum"
...

Exact matches (4):
- https://upload.wikimedia.org/.../Mona_Lisa.jpg
...

Web entities (12):
- Mona Lisa (0.95)
- Leonardo da Vinci (0.87)
- Louvre (0.82)
...
```

## Supported formats

| Format | Supported | Notes |
|---|---|---|
| JPEG | ✓ | |
| PNG | ✓ | |
| GIF | ✓ | Vision uses the first frame of animated GIFs |
| BMP | ✓ | |
| WebP | ✓ | |
| TIFF | ✓ | |
| ICO | ✓ | |
| SVG | ✗ | Pre-rejected. Convert to PNG or JPEG first. |
| HEIC / HEIF | ✗ | Pre-rejected. Convert to JPEG first. |

## Size limit

Local files must be **≤ 7 MB**. Vision's JSON payload ceiling is 10 MB, and base64 encoding adds ~33% overhead. Larger files are rejected with a clear error and a resize hint.

Resize quickly with one of:

```bash
# ffmpeg (any format → JPEG, max 2000px wide)
ffmpeg -i input.jpg -vf scale=2000:-1 resized.jpg

# ImageMagick
magick input.jpg -resize 2000x2000 resized.jpg
```

The `image_url` path has no size limit on your side — Google fetches the image directly, subject to its own limits.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOOGLE_VISION_API_KEY` | yes | — | Your Cloud Vision API key. |
| `VISION_TIMEOUT_MS` | no | `30000` | Request timeout in milliseconds. |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `GOOGLE_VISION_API_KEY environment variable is required` | Env var not set | Set it in your MCP client config under `env` |
| HTTP 403, "API key rejected" | Key wrong, API not enabled, or HTTP-referrer restriction | Verify key, enable Cloud Vision API, remove HTTP-referrer restrictions |
| HTTP 403, "quota exceeded" | Used your 1000 free calls | Wait until next month, or confirm billing is enabled |
| `Vision returned no results` after `image_url` call | Google couldn't fetch the URL | Verify the URL returns an image directly (no login, redirects, or CORS) |
| `HEIC/HEIF images are not supported` | iPhone photos | Convert to JPEG first |
| `Image is X.Y MB; Vision limit is ~7 MB` | Local file too large | Resize with `ffmpeg` or `magick` (see above) |

## License

MIT
