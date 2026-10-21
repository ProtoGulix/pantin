import { bridgeCard, chooseZoneView, FORCED, goToWelcome, openExample } from "./pantin-page.ts";
import type { Session } from "./session.ts";
import { saveShot } from "./session.ts";

// The I/O view with two modules, to show the sections, the subtitles and the feedbacks that a
// second module can take from the first. The second module is built through the API of the
// throwaway core and thrown away with "discard" right after.
const PANTIN_URL_PATH = "/api/pantins/plc-cylinder";

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

export async function captureIoView(session: Session): Promise<void> {
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
  await goToWelcome(session);
  await openExample(session);
}
