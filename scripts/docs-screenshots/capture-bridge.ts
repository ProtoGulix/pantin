import type { Locator } from "playwright-core";
import { bridgeCard, FORCED } from "./pantin-page.ts";
import type { Session } from "./session.ts";
import { saveShot } from "./session.ts";

async function waitForBridgeState(session: Session, card: Locator, wanted: RegExp): Promise<void> {
  await card.getByRole("status").filter({ hasText: wanted }).waitFor({ timeout: 30_000 });
  // The card also lists the modules: let them settle on the state just reached.
  await session.page.waitForTimeout(300);
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
  await card.getByRole("button", { name: label("bridge.action.stop") }).click(FORCED);
  await waitForBridgeState(session, card, new RegExp(label("bridge.state.stopped")));
}
