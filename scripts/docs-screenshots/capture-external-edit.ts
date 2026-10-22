import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { FORCED } from "./pantin-page.ts";
import type { Session } from "./session.ts";
import { saveShot } from "./session.ts";

// The banner of ADR 0063 needs a file that changed on disk behind the core's back. The throwaway
// core's copy of the example is edited here, then the window gets the focus back, as it does when
// the user returns from an editor. The reload action then puts the picture back as it was.
const BANNER_SELECTOR = "#external-edit-banner";

export async function captureExternalEditBanner(
  session: Session,
  pantinsDirectory: string,
): Promise<void> {
  const { page, label } = session;
  // A trailing newline keeps the JSON valid and changes the bytes, hence the hash.
  await appendFile(join(pantinsDirectory, "plc-cylinder", "pantin.json"), "\n");
  const banner = page.locator(BANNER_SELECTOR);
  // A focus event that arrives while a request is in flight is ignored by design, so it is sent
  // again until the banner shows.
  for (let attempt = 0; attempt < 30 && (await banner.isHidden()); attempt += 1) {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(1000);
  }
  await banner.waitFor({ state: "visible", timeout: 5000 });
  await saveShot(session, "external-edit-banner", banner);
  await banner
    .getByRole("button", { name: label("externalEdit.reload.one"), exact: true })
    .click(FORCED);
  await banner.waitFor({ state: "hidden" });
}
