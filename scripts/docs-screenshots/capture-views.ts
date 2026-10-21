import {
  chooseZoneView,
  closeBottomZone,
  diagramCoil,
  FORCED,
  regionAround,
} from "./pantin-page.ts";
import type { Region, Session } from "./session.ts";
import { saveShot } from "./session.ts";

const TRANSPORT_BAR_PADDING = 8;
const NODE_FRAME_MARGIN = 14;

export async function captureOverview(session: Session): Promise<void> {
  await saveShot(session, "overview");
}

/**
 * The home page shows the same screen in both themes: the viewer follows the browser's scheme.
 * The scheme is put back afterwards, so that the later pictures keep the context's own one.
 */
export async function captureHome(
  session: Session,
  contextScheme: "light" | "dark",
): Promise<void> {
  for (const scheme of ["light", "dark"] as const) {
    await session.page.emulateMedia({ colorScheme: scheme });
    await saveShot(session, `home-${scheme}`);
  }
  await session.page.emulateMedia({ colorScheme: contextScheme });
}

export async function captureTransportBar(session: Session, shotName: string): Promise<void> {
  const bar = session.page.getByRole("group", { name: session.label("clock.label") });
  const region = await regionAround(bar, { left: 8, top: 8, right: 0, bottom: 8 });
  // The bar spans the whole central area while its contents fill the left part: crop to the
  // right edge of the last child, which moves when the "Release all" button appears.
  const contentsRight = await bar.evaluate((element) =>
    Math.max(...Array.from(element.children, (child) => child.getBoundingClientRect().right)),
  );
  await saveShot(session, shotName, {
    ...region,
    width: Math.ceil(contentsRight - region.x) + TRANSPORT_BAR_PADDING,
  });
}

export async function captureViewCube(session: Session): Promise<void> {
  const cube = session.page.locator("#view-cube");
  await saveShot(
    session,
    "view-cube",
    await regionAround(cube, { left: 20, top: 20, right: 20, bottom: 20 }),
  );
}

/**
 * The 3D view on top and the Liaisons view below, then the Liaisons view alone, with its legend.
 * Only the first picture needs the 3D view: it is hidden right after, before the others.
 */
export async function captureJointView(session: Session): Promise<void> {
  const { page, label } = session;
  await chooseZoneView(session, "bottom", "view.joints");
  const joints = page.locator(".joint-star");
  await joints.waitFor();
  const fit = page.getByRole("button", { name: label("jointStar.fit"), exact: true });
  await fit.click(FORCED);
  await saveShot(session, "zones");
  // Leaving the 3D view first: closing the bottom zone before would make the software renderer
  // draw the 3D view at full size once more.
  await chooseZoneView(session, "top", "view.diagram");
  await closeBottomZone(session);
  await chooseZoneView(session, "top", "view.joints");
  await fit.click(FORCED);
  await saveShot(session, "joint-view", joints);
  await page.getByRole("button", { name: label("jointStar.legend.title") }).click(FORCED);
  await saveShot(session, "joint-legend", page.locator(".joint-star-legend"));
  await page.getByRole("button", { name: label("jointStar.legend.title") }).click(FORCED);
  await chooseZoneView(session, "top", "view.diagram");
}

export async function captureDiagram(session: Session): Promise<void> {
  const diagram = session.page.getByRole("region", { name: session.label("diagram.label") });
  await diagram.waitFor();
  await saveShot(session, "diagram", diagram);
}

/** Frames the whole drive node through the whole joint node, inside the diagram's own box. */
async function frameDriveToJoint(session: Session): Promise<Region> {
  const diagram = session.page.getByRole("region", { name: session.label("diagram.label") });
  const boxes = await Promise.all([
    diagram.boundingBox(),
    diagram.locator(".diagram-node--drive").first().boundingBox(),
    diagram.locator(".diagram-node--joint").first().boundingBox(),
  ]);
  const [diagramBox, driveBox, jointBox] = boxes;
  if (!diagramBox || !driveBox || !jointBox) {
    throw new Error("The diagram, its drive node or its joint node is not visible.");
  }
  const left = Math.max(diagramBox.x, driveBox.x - NODE_FRAME_MARGIN);
  const top = Math.max(diagramBox.y, driveBox.y - NODE_FRAME_MARGIN);
  const right = Math.min(
    diagramBox.x + diagramBox.width,
    jointBox.x + jointBox.width + NODE_FRAME_MARGIN,
  );
  const bottom = Math.min(
    diagramBox.y + diagramBox.height,
    Math.max(driveBox.y + driveBox.height, jointBox.y + jointBox.height) + NODE_FRAME_MARGIN,
  );
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Forces a command from the diagram, shows its mark and the release button, then releases it. */
export async function captureForcedTag(session: Session): Promise<void> {
  const { page, label } = session;
  const coil = diagramCoil(page);
  await coil.click(FORCED);
  const releaseAll = page.getByRole("button", { name: label("forced.releaseAll", { count: 1 }) });
  await releaseAll.waitFor();
  await saveShot(session, "forced-tag", await frameDriveToJoint(session));
  await captureTransportBar(session, "release-all");
  await releaseAll.click(FORCED);
  await releaseAll.waitFor({ state: "detached" });
}
