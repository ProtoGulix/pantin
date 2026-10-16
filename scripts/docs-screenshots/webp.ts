import type { Page } from "playwright-core";

const WEBP_QUALITY = 0.85;

/**
 * Playwright only writes PNG or JPEG, and the project adds no image tool: the browser that took
 * the picture also encodes it, through a canvas.
 */
export async function convertPngToWebp(page: Page, png: Buffer): Promise<Buffer> {
  const pngDataUrl = `data:image/png;base64,${png.toString("base64")}`;
  const webpDataUrl = await page.evaluate(
    async ({ source, quality }) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      return canvas.toDataURL("image/webp", quality);
    },
    { source: pngDataUrl, quality: WEBP_QUALITY },
  );
  const prefix = "data:image/webp;base64,";
  if (!webpDataUrl.startsWith(prefix)) {
    throw new Error("This Chromium cannot encode WebP.");
  }
  return Buffer.from(webpDataUrl.slice(prefix.length), "base64");
}
