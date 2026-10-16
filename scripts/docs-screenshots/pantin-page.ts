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
  return page.getByRole("treeitem", { name: JOINT_ROW });
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

export async function showCentralView(
  session: Session,
  view: "toolbar.view3d" | "toolbar.viewDiagram" | "toolbar.viewBoth",
): Promise<void> {
  const group = session.page.getByRole("group", { name: session.label("toolbar.viewSwitch") });
  await group.getByRole("button", { name: session.label(view), exact: true }).click(FORCED);
}
