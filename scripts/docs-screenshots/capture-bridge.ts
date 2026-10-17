import { connect } from "node:net";
import type { Locator } from "playwright-core";
import { bridgeCard, FORCED } from "./pantin-page.ts";
import type { Session } from "./session.ts";
import { saveShot } from "./session.ts";

async function waitForBridgeState(session: Session, card: Locator, wanted: RegExp): Promise<void> {
  await card.getByRole("status").filter({ hasText: wanted }).waitFor({ timeout: 30_000 });
  // The card also lists the modules: let them settle on the state just reached.
  await session.page.waitForTimeout(300);
}

// Modbus "write single register" (value 0 to register 0) addressed to unit 2: the module
// answers unit 1, so it refuses and writes nothing.
const REFUSED_REQUEST = Buffer.from("000100000006020600000000", "hex");
// The port of module m1 in examples/plc-cylinder/io.json.
const MODULE_PORT = 1502;
const ANSWER_TIMEOUT_MILLISECONDS = 5_000;

/** Sends one request the module refuses, so the journal gets a WARNING line to show. */
async function sendRefusedRequest(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = connect({ host: "127.0.0.1", port: MODULE_PORT }, () => {
      socket.write(REFUSED_REQUEST);
    });
    socket.setTimeout(ANSWER_TIMEOUT_MILLISECONDS, () => {
      socket.destroy(new Error(`No Modbus answer on 127.0.0.1:${MODULE_PORT}.`));
    });
    socket.once("data", () => socket.end());
    socket.once("close", () => resolve());
    socket.once("error", reject);
  });
}

async function captureJournal(session: Session, card: Locator): Promise<void> {
  const { label } = session;
  await sendRefusedRequest();
  await card.getByRole("button", { name: label("bridge.journal.button") }).click(FORCED);
  const dialog = session.page.getByRole("dialog", { name: label("bridge.journal.title") });
  await dialog.getByText("WARNING").first().waitFor({ timeout: 15_000 });
  await saveShot(session, "bridge-journal", dialog);
  await session.page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
}

/** The bridge binds the Modbus ports on localhost only; it is stopped again before we leave. */
export async function captureBridgeCard(session: Session): Promise<void> {
  const { label } = session;
  const card = bridgeCard(session);
  await saveShot(session, "bridge-stopped", card);
  await card.getByRole("button", { name: label("bridge.action.start") }).click(FORCED);
  const running = new RegExp(label("bridge.state.running"));
  await waitForBridgeState(session, card, running);
  await saveShot(session, "bridge-running", card);
  await captureJournal(session, card);
  await card.getByRole("button", { name: label("bridge.action.stop") }).click(FORCED);
  await waitForBridgeState(session, card, new RegExp(label("bridge.state.stopped")));
}
