import { bridgeCard, diagramCoil, FORCED, regionAround, showCentralView } from "./pantin-page.ts";
import type { Region, Session } from "./session.ts";
import { saveShot } from "./session.ts";

const TRANSPORT_BAR_PADDING = 8;
const NODE_FRAME_MARGIN = 14;

export async function captureOverview(session: Session): Promise<void> {
  await saveShot(session, "overview");
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

export async function captureDiagram(session: Session): Promise<void> {
  const diagram = session.page.getByRole("region", { name: session.label("diagram.label") });
  await diagram.waitFor();
  await saveShot(session, "diagram", diagram);
}

export async function captureIoView(session: Session): Promise<void> {
  const { page, label } = session;
  await bridgeCard(session)
    .getByRole("button", { name: label("bridge.configureIoShort") })
    .click(FORCED);
  await page.getByRole("heading", { name: label("io.modules.title") }).waitFor();
  await saveShot(session, "io-view");
  await showCentralView(session, "toolbar.viewDiagram");
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
