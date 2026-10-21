import type { ConsoleResponse, PantinId } from "@pantin/protocol";
import { readConsoleAfter } from "../domain/console-buffer.ts";
import { EMPTY_TRACE_BUDGET } from "../domain/sensor-trace.ts";
import { loadPantin, type ServiceContext } from "./open-pantins.ts";

// Reading the console of an open Pantin (ADR 0031 point 4) and switching its
// verbose mode (ADR 0061 point 6).

async function readConsole(
  context: ServiceContext,
  pantinId: PantinId,
  after: number,
): Promise<ConsoleResponse> {
  const openPantin = await loadPantin(context, pantinId);
  return readConsoleAfter(openPantin.console, after, openPantin.verbose);
}

// Idempotent. A real change starts a fresh budget, so that a count left over
// from an earlier verbose run is not reported in the next one.
export async function setConsoleVerbose(
  context: ServiceContext,
  pantinId: PantinId,
  verbose: boolean,
): Promise<Pick<ConsoleResponse, "verbose">> {
  const openPantin = await loadPantin(context, pantinId);
  if (openPantin.verbose !== verbose) {
    openPantin.verbose = verbose;
    openPantin.traceBudget = EMPTY_TRACE_BUDGET;
  }
  return { verbose: openPantin.verbose };
}

export function consoleOperations(context: ServiceContext) {
  return {
    readConsole: (pantinId: PantinId, after: number) => readConsole(context, pantinId, after),
    setConsoleVerbose: (pantinId: PantinId, verbose: boolean) =>
      setConsoleVerbose(context, pantinId, verbose),
  };
}
