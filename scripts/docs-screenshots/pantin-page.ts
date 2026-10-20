import type { Locator, Page } from "playwright-core";
import type { Region, Session } from "./session.ts";

/** The example's assembly and joint, as they read in the tree whatever the language. */
const ASSEMBLY_ROW = /^Verin1 verin1/;
const JOINT_ROW = /^verin /;
const DRIVE_COIL = /\b14\b/;

/**
 * After a Pantin opens, the three body meshes load, then the first frames render. The viewer has
 * no "ready" signal, so we wait for the meshes and a short documented delay for the frames.
 */
const FIRST_FRAMES_DELAY_MS = 1500;

/**
 * While software WebGL renders about one frame per second, Playwright's "stable element" check
 * (two equal animation frames) can take longer than any timeout. Every target here is a plain
 * button that does not move, so the check and the wait for navigations are skipped.
 */
export const FORCED = { force: true, noWaitAfter: true } as const;

export function bridgeCard(session: Session): Locator {
  return session.page.getByRole("region", { name: session.label("bridge.label") });
}

export function inspector(session: Session): Locator {
  return session.page.getByRole("complementary", { name: session.label("inspector.title") });
}

export function treePanel(page: Page): Locator {
  return page.locator("aside").first();
}

export function assemblyRow(page: Page): Locator {
  return page.getByRole("treeitem", { name: ASSEMBLY_ROW });
}

export function jointRow(page: Page): Locator {
  // The joint appears under its parent and its child assembly and in its own list: any row selects it.
  return page.getByRole("treeitem", { name: JOINT_ROW }).first();
}

export function diagramCoil(page: Page): Locator {
  return page.getByRole("application").getByRole("button", { name: DRIVE_COIL });
}

/** A region around an element, for pictures that show it in its surroundings. */
export async function regionAround(
  element: Locator,
  margins: { left: number; top: number; right: number; bottom: number },
): Promise<Region> {
  const box = await element.boundingBox();
  if (box === null) {
    throw new Error("The element to frame is not visible.");
  }
  return {
    x: Math.max(0, box.x - margins.left),
    y: Math.max(0, box.y - margins.top),
    width: box.width + margins.left + margins.right,
    height: box.height + margins.top + margins.bottom,
  };
}

export async function goToWelcome(session: Session): Promise<void> {
  await session.page.goto(session.baseUrl);
  await session.page.getByRole("dialog", { name: session.label("welcome.title") }).waitFor();
}

export async function openExample(session: Session): Promise<void> {
  const { page } = session;
  const meshesLoaded = Promise.all(
    [1, 2, 3].map(() => page.waitForResponse((response) => response.url().endsWith(".glb"))),
  );
  await page.getByRole("button", { name: /^plc-cylinder/ }).click(FORCED);
  await meshesLoaded;
  await assemblyRow(page).waitFor();
  await page.waitForTimeout(FIRST_FRAMES_DELAY_MS);
}

export type CentralViewKey = "view.3d" | "view.diagram" | "view.joints" | "view.io";

function zoneBar(session: Session, zone: "top" | "bottom"): Locator {
  return session.page.getByRole("group", { name: session.label(`zone.${zone}.label`) });
}

/** Chooses a view in the selector of one zone (a view shown in the other zone is disabled). */
export async function chooseZoneView(
  session: Session,
  zone: "top" | "bottom",
  view: CentralViewKey,
): Promise<void> {
  await zoneBar(session, zone)
    .getByRole("button", { name: session.label(view), exact: true })
    .click(FORCED);
}

export async function closeBottomZone(session: Session): Promise<void> {
  await zoneBar(session, "bottom")
    .getByRole("button", { name: session.label("zone.closeBottom") })
    .click(FORCED);
}
