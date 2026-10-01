import type { ConsoleResponse, PantinId } from "@pantin/protocol";
import { readConsoleAfter } from "../domain/console-buffer.ts";
import { loadPantin, type ServiceContext } from "./open-pantins.ts";

// Reading the console of an open Pantin (ADR 0031 point 4).

export async function readConsole(
  context: ServiceContext,
  pantinId: PantinId,
  after: number,
): Promise<ConsoleResponse> {
  return readConsoleAfter((await loadPantin(context, pantinId)).console, after);
}
