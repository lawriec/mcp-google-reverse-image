import path from "node:path";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  validateFilePath,
  validateImageUrl,
  validateMaxResults,
  getVisionApiKey,
} from "../utils/validators.js";
import { resolveImageSource } from "../utils/image-source.js";
import {
  visionWebDetection,
  type WebDetection,
  type WebEntity,
  type WebImage,
  type WebPage,
} from "../utils/vision-client.js";

export interface ReverseImageSearchArgs {
  file_path?: string;
  image_url?: string;
  max_results?: number;
}

const DEFAULT_MAX_RESULTS = 20;

export async function handleReverseImageSearch(
  args: ReverseImageSearchArgs
): Promise<CallToolResult> {
  try {
    const hasPath =
      typeof args.file_path === "string" && args.file_path.trim() !== "";
    const hasUrl =
      typeof args.image_url === "string" && args.image_url.trim() !== "";
    if (hasPath === hasUrl) {
      throw new Error("Provide exactly one of file_path or image_url.");
    }

    const filePath = hasPath ? validateFilePath(args.file_path!) : undefined;
    const imageUrl = hasUrl ? validateImageUrl(args.image_url!) : undefined;
    const maxResults =
      args.max_results !== undefined
        ? validateMaxResults(args.max_results)
        : DEFAULT_MAX_RESULTS;

    const apiKey = getVisionApiKey();

    const imageSource = await resolveImageSource({ filePath, imageUrl });

    const webDetection = await visionWebDetection({
      imageSource,
      apiKey,
      maxResults: 50,
    });

    const originLabel = filePath ? path.basename(filePath) : imageUrl!;
    const text = formatWebDetection(
      webDetection,
      maxResults,
      originLabel,
      imageUrl !== undefined
    );

    return { content: [{ type: "text" as const, text }] };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text" as const, text: msg }],
      isError: true,
    };
  }
}

function formatWebDetection(
  wd: WebDetection,
  maxResults: number,
  originLabel: string,
  usedImageUri: boolean
): string {
  const bestGuess = firstBestGuess(wd.bestGuessLabels);
  const entities = filterEntities(wd.webEntities);
  const full = wd.fullMatchingImages ?? [];
  const partial = wd.partialMatchingImages ?? [];
  const pages = wd.pagesWithMatchingImages ?? [];
  const similar = wd.visuallySimilarImages ?? [];

  const totalFull = full.length;
  const totalPartial = partial.length;
  const totalPages = pages.length;
  const totalSimilar = similar.length;
  const totalEntities = entities.length;
  const allEmpty =
    !bestGuess &&
    totalFull === 0 &&
    totalPartial === 0 &&
    totalPages === 0 &&
    totalSimilar === 0 &&
    totalEntities === 0;

  const lines: string[] = [];
  lines.push(`Reverse image search results for: ${originLabel}`);
  lines.push("");

  if (bestGuess) {
    lines.push(`Best guess: "${bestGuess}"`);
    lines.push("");
  }

  lines.push(
    `Summary: ${totalFull} exact match(es), ${totalPartial} partial match(es), ` +
      `${totalPages} page(s), ${totalSimilar} similar, ${totalEntities} entities.`
  );

  if (allEmpty) {
    lines.push("");
    if (usedImageUri) {
      lines.push(
        "Note: Vision returned no results. Verify the URL is publicly accessible " +
          "and directly returns an image (no login, redirect, or CORS restriction)."
      );
    } else {
      lines.push(
        "Note: Vision returned no results. The image may not be indexed anywhere on the web."
      );
    }
    return lines.join("\n");
  }

  appendPagesSection(lines, pages, maxResults);
  appendImagesSection(lines, "Exact matches", full, maxResults);
  appendImagesSection(lines, "Partial matches", partial, maxResults);
  appendImagesSection(lines, "Visually similar", similar, maxResults);
  appendEntitiesSection(lines, entities, maxResults);

  return lines.join("\n");
}

function firstBestGuess(labels: WebDetection["bestGuessLabels"]): string | null {
  if (!labels || labels.length === 0) return null;
  const label = labels[0]?.label?.trim();
  return label || null;
}

function filterEntities(entities: WebEntity[] | undefined): WebEntity[] {
  if (!entities) return [];
  return entities.filter(
    (e) =>
      typeof e.description === "string" &&
      e.description.trim() !== "" &&
      // Drop entities that are bare machine IDs like "/m/0dx1j"
      !/^\/[a-z]\/[a-z0-9_]+$/i.test(e.description.trim())
  );
}

function appendPagesSection(
  lines: string[],
  pages: WebPage[],
  maxResults: number
): void {
  if (pages.length === 0) return;
  const shown = pages.slice(0, maxResults);
  lines.push("");
  lines.push(sectionHeader("Pages containing this image", shown.length, pages.length));
  for (const page of shown) {
    const title = sanitizeTitle(page.pageTitle);
    const titlePart = title ? ` — "${title}"` : " — (no title)";
    lines.push(`- ${page.url}${titlePart}`);
  }
}

function appendImagesSection(
  lines: string[],
  heading: string,
  images: WebImage[],
  maxResults: number
): void {
  if (images.length === 0) return;
  const shown = images.slice(0, maxResults);
  lines.push("");
  lines.push(sectionHeader(heading, shown.length, images.length));
  for (const img of shown) {
    lines.push(`- ${img.url}`);
  }
}

function appendEntitiesSection(
  lines: string[],
  entities: WebEntity[],
  maxResults: number
): void {
  if (entities.length === 0) return;
  const shown = entities.slice(0, maxResults);
  lines.push("");
  lines.push(sectionHeader("Web entities", shown.length, entities.length));
  for (const entity of shown) {
    const desc = (entity.description ?? "").trim();
    const score =
      typeof entity.score === "number" ? ` (${entity.score.toFixed(2)})` : "";
    lines.push(`- ${desc}${score}`);
  }
}

function sectionHeader(
  title: string,
  shownCount: number,
  totalCount: number
): string {
  if (shownCount < totalCount) {
    return `${title} (showing ${shownCount} of ${totalCount}):`;
  }
  return `${title} (${totalCount}):`;
}

function sanitizeTitle(title: string | undefined): string {
  if (!title) return "";
  return title.replace(/[\r\n]+/g, " ").trim();
}
