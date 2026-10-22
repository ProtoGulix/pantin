import { join } from "node:path";
import type { Locator } from "playwright-core";
import {
  bridgeCard,
  chooseZoneView,
  closeBottomZone,
  FORCED,
  goToWelcome,
  openExample,
} from "./pantin-page.ts";
import type { Session } from "./session.ts";
import { saveShot } from "./session.ts";

// The OPC UA pictures need no OPC UA server: the Pantin copy gets a second module of kind
// "opcua_client" through the API of the throwaway core, and the bridge is never started. The edits
// stay unsaved and are discarded right after, as for the other I/O pictures.
const PANTIN_URL_PATH = "/api/pantins/plc-cylinder";
const SYMBOLS_FILE = "scripts/docs-screenshots/example-symbols.xml";
// A placeholder: the real namespace URI of a CODESYS server is not verified (ADR 0065).
const EXAMPLE_NAMESPACE_URI = "urn:example:plc";
// The central zone of a 1600 x 900 window: between the left panel and the inspector.
const ioViewRegion = { x: 324, y: 56, width: 934, height: 840 };
const EXAMPLE_PLC_ADDRESS = "192.168.56.20";
const MOVED_TAGS: readonly string[] = [
  "verin1.verin1.coil_14",
  "verin1.verin1.coil_12",
  "tige.verin-max.state",
  "tige.verin.position",
];

async function send(session: Session, method: string, path: string, body: object): Promise<void> {
  const response = await fetch(`${session.baseUrl}${PANTIN_URL_PATH}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${method} ${path} answered ${response.status}: ${await response.text()}`);
  }
}

async function addOpcuaModuleWithChannels(session: Session): Promise<void> {
  await send(session, "POST", "/io/modules", {
    transport: { kind: "opcua_client", namespaceUri: EXAMPLE_NAMESPACE_URI },
  });
  for (const tag of MOVED_TAGS) {
    await send(session, "PATCH", `/io/modules/m1/channels/${encodeURIComponent(tag)}`, {
      module: "m2",
    });
  }
}

async function openIoView(session: Session): Promise<void> {
  const { page, label } = session;
  await goToWelcome(session);
  await openExample(session);
  await bridgeCard(session)
    .getByRole("button", { name: label("bridge.configureIoShort") })
    .click(FORCED);
  await page.getByRole("heading", { name: label("io.modules.title") }).waitFor();
}

function opcuaCard(session: Session): Locator {
  return session.page.getByRole("region", { name: session.label("bridge.opcua.label") });
}

/** The OPC UA bridge card (stopped, with a target typed), the I/O view and the proposal dialog. */
export async function captureOpcua(session: Session, repositoryRoot: string): Promise<void> {
  const { page, label } = session;
  await goToWelcome(session);
  await openExample(session);
  await addOpcuaModuleWithChannels(session);
  await openIoView(session);
  const card = opcuaCard(session);
  await card.waitFor();
  await card.getByLabel(label("bridge.opcua.target", { key: "m2" })).fill(EXAMPLE_PLC_ADDRESS);
  await saveShot(session, "opcua-card", card);
  // The OPC UA module becomes the target of the mappings and the diagram below is closed, so that
  // the whole section, its settings and its channels fit in the picture.
  await page.getByRole("button", { name: label("io.section.choose") }).click(FORCED);
  // An earlier picture may already have closed it: the layout is kept between page loads.
  const closeButton = page.getByRole("button", { name: label("zone.closeBottom") });
  if ((await closeButton.count()) > 0) {
    await closeBottomZone(session);
  }
  await page.getByText(label("io.section.target")).waitFor();
  await saveShot(session, "io-opcua", ioViewRegion);
  await page.locator('input[accept*="xml"]').setInputFiles(join(repositoryRoot, SYMBOLS_FILE));
  const dialog = page.getByRole("dialog", { name: label("symbols.title") });
  await dialog.waitFor();
  await dialog.getByText(label("symbols.moduleProposal.toCheck")).waitFor();
  await saveShot(session, "opcua-symbols", dialog);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  // The later pictures start from the diagram, as before this one existed.
  await chooseZoneView(session, "top", "view.diagram");
  await send(session, "POST", "/discard", {});
  await goToWelcome(session);
  await openExample(session);
}
