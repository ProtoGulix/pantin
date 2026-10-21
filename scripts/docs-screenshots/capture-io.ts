import { join } from "node:path";
import { bridgeCard, chooseZoneView, FORCED, goToWelcome, openExample } from "./pantin-page.ts";
import type { Session } from "./session.ts";
import { saveShot } from "./session.ts";

// The I/O view with two modules, to show the sections, the subtitles and the feedbacks that a
// second module can take from the first. The second module is built through the API of the
// throwaway core and thrown away with "discard" right after.
const PANTIN_URL_PATH = "/api/pantins/plc-cylinder";

const SYMBOLS_FILE = "scripts/docs-screenshots/example-symbols.xml";
const OTHER_NAMES: Readonly<Record<string, string>> = {
  "verin1.verin1.coil_12": "cmd_sortie",
  "tige.verin.position": "position_tige",
  "tige.verin-max.state": "fin_course_max",
};

async function patchChannel(session: Session, tag: string, body: object): Promise<void> {
  const url = `${session.baseUrl}${PANTIN_URL_PATH}/io/modules/m1/channels/${encodeURIComponent(tag)}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`PATCH ${tag} answered ${response.status}: ${await response.text()}`);
  }
}

async function post(session: Session, path: string, body?: object): Promise<void> {
  const response = await fetch(`${session.baseUrl}${PANTIN_URL_PATH}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} answered ${response.status}: ${await response.text()}`);
  }
}

export async function captureIoView(session: Session, repositoryRoot: string): Promise<void> {
  const { page, label } = session;
  await post(session, "/io/modules", { transport: { kind: "modbus_tcp_slave" } });
  // The mapping is read when the Pantin opens: open it again to show the new module.
  await goToWelcome(session);
  await openExample(session);
  await bridgeCard(session)
    .getByRole("button", { name: label("bridge.configureIoShort") })
    .click(FORCED);
  await page.getByRole("heading", { name: label("io.modules.title") }).waitFor();
  // The second module becomes the target of the mappings: its section says so in words.
  await page.getByRole("button", { name: label("io.section.choose") }).click(FORCED);
  await page.getByText(label("io.section.target")).waitFor();
  await saveShot(session, "io-view");
  await chooseZoneView(session, "top", "view.diagram");
  await post(session, "/discard");
  await captureSymbolImport(session, repositoryRoot);
  await goToWelcome(session);
  await openExample(session);
}

// The symbol import window on a mapping whose variable names differ from the PLC's: the
// edits stay unsaved in the throwaway core and are discarded right after, so nothing else changes.
async function captureSymbolImport(session: Session, repositoryRoot: string): Promise<void> {
  const { page, label } = session;
  await goToWelcome(session);
  await openExample(session);
  for (const [tag, variable] of Object.entries(OTHER_NAMES)) {
    await patchChannel(session, tag, { variable });
  }
  await bridgeCard(session)
    .getByRole("button", { name: label("bridge.configureIoShort") })
    .click(FORCED);
  await page.getByRole("heading", { name: label("io.modules.title") }).waitFor();
  await page.locator('input[accept*="xml"]').setInputFiles(join(repositoryRoot, SYMBOLS_FILE));
  const dialog = page.getByRole("dialog", { name: label("symbols.title") });
  await dialog.waitFor();
  // Sure matches start checked; the person also picks a variable for the unmatched signal.
  await dialog.getByRole("combobox").selectOption({ index: 1 });
  await saveShot(session, "io-symbols", dialog);
  await dialog.getByRole("button", { name: label("symbols.apply") }).click(FORCED);
  await page.getByText(label("symbols.done").split(" {count}")[0] ?? "").waitFor();
  await saveShot(session, "io-symbols-done", dialog);
  await dialog.getByRole("button", { name: label("symbols.close") }).click(FORCED);
  // The later pictures start from the diagram, as before this one existed.
  await chooseZoneView(session, "top", "view.diagram");
  await post(session, "/discard");
}
