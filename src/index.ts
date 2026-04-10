#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { handleReverseImageSearch } from "./tools/index.js";
import type { ReverseImageSearchArgs } from "./tools/reverse-image-search.js";

const server = new Server(
  { name: "google-reverse-image", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "reverse_image_search",
      description:
        "Reverse image search via Google Cloud Vision Web Detection. " +
        "Given a local image file path OR a public HTTPS image URL, returns pages on " +
        "the web that contain the image, exact/partial/visually-similar matches, " +
        "Google's best-guess label, and detected web entities. " +
        "Provide exactly one of file_path or image_url. " +
        "Supports JPEG, PNG, GIF (first frame), BMP, WebP, TIFF, ICO. " +
        "Does NOT support SVG or HEIC/HEIF — convert first. " +
        "Local files must be <= 7 MB (Vision's JSON payload ceiling after base64 overhead); " +
        "larger files are rejected with a resize hint. " +
        "Requires GOOGLE_VISION_API_KEY (1000 free Web Detection calls/month, $3.50/1k after).",
      inputSchema: {
        type: "object" as const,
        properties: {
          file_path: {
            type: "string",
            description:
              "Absolute path to a local image file. Max 7 MB. " +
              "Mutually exclusive with image_url.",
          },
          image_url: {
            type: "string",
            description:
              "Public HTTPS URL of an image. Google fetches it server-side, so " +
              "the URL must be directly reachable (no auth, no redirects to login). " +
              "Mutually exclusive with file_path.",
          },
          max_results: {
            type: "number",
            description:
              "Max items shown per result section (pages, exact, partial, similar, entities). " +
              "Default 20, range 1-50.",
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "reverse_image_search":
      return handleReverseImageSearch(args as unknown as ReverseImageSearchArgs);
    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-google-reverse-image MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
