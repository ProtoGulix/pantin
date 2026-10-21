import { FORCED } from "./pantin-page.ts";
import type { Session } from "./session.ts";
import { saveShot } from "./session.ts";

const RETRACT_COIL = /\b12\b/;

/**
 * The console in verbose mode (ADR 0061): forcing the retract coil moves the cylinder, and its
 * end-of-travel sensors switch, which writes trace lines. The coil is released and verbose is
 * turned off again, so the pictures that follow show the usual console state.
 */
export async function captureConsoleVerbose(session: Session): Promise<void> {
  const { page, label } = session;
  await page.keyboard.press("F8");
  const consolePanel = page.locator("#console");
  await consolePanel.waitFor();
  const verbose = consolePanel.getByRole("button", { name: label("console.verbose") });
  await verbose.click(FORCED);
  // The earlier pictures left Modbus warnings here: the picture shows the trace lines only.
  await consolePanel.getByRole("button", { name: label("console.clear") }).click(FORCED);
  // The previous picture left the bistable valve on coil 14: coil 12 brings the cylinder back.
  await page.getByRole("application").getByRole("button", { name: RETRACT_COIL }).click(FORCED);
  await consolePanel.locator(".console-line--trace").first().waitFor({ timeout: 30_000 });
  // Let the cylinder reach its other end: both sensors have switched by then.
  await page.waitForTimeout(3_000);
  await saveShot(session, "console-verbose", consolePanel);
  await verbose.click(FORCED);
  await page.getByRole("button", { name: label("forced.releaseAll", { count: 1 }) }).click(FORCED);
  await page.keyboard.press("F8");
}
