import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Locator, Page } from "playwright-core";
import type { Label, Language } from "./labels.ts";
import { convertPngToWebp } from "./webp.ts";

export type Region = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

// Software WebGL renders a frame in seconds, and a screenshot waits for one.
const SCREENSHOT_TIMEOUT_MS = 60_000;

/** What one language run needs: the page that is driven, the texts, and where pictures go. */
export type Session = {
  readonly page: Page;
  readonly encoderPage: Page;
  readonly baseUrl: string;
  readonly language: Language;
  readonly label: Label;
  readonly outputDirectory: string;
  readonly savedNames: string[];
};

async function regionOf(target: Locator | Region): Promise<Region> {
  if (!("boundingBox" in target)) {
    return target;
  }
  const box = await target.boundingBox();
  if (box === null) {
    throw new Error("The element to capture is not visible.");
  }
  return box;
}

/**
 * Saves a picture of the whole page, or of an element or region of it. An element is captured
 * as a clip of the page: Playwright's element screenshot waits for the element to be "stable",
 * which never settles while the 3D view renders at one frame per second.
 */
export async function saveShot(
  session: Session,
  name: string,
  target?: Locator | Region,
): Promise<void> {
  const clip = target === undefined ? undefined : await regionOf(target);
  const png = await session.page.screenshot({
    timeout: SCREENSHOT_TIMEOUT_MS,
    ...(clip && { clip }),
  });
  const webp = await convertPngToWebp(session.encoderPage, png);
  await mkdir(session.outputDirectory, { recursive: true });
  await writeFile(join(session.outputDirectory, `${name}.webp`), webp);
  session.savedNames.push(name);
  process.stdout.write(`  ${session.language}/${name}\n`);
}
