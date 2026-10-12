import type { PantinDocument } from "@pantin/protocol";
import { afterEach } from "vitest";
import type { PhysicsWorldFactory } from "../domain/physics-world.ts";
import { newOpenPantin } from "../service/open-pantins.ts";
import { createServiceContext } from "../service/pantin-service.ts";
import { disposePhysics } from "../service/physics-runtime.ts";
import { runSteps, writeTag } from "../service/simulation.ts";
import { createPantinStore } from "../store/pantin-store.ts";
import { testPhysicsWorldFactory } from "./physics-factory.ts";

// An open Pantin with a real physics world, driven through the service
// functions the clock routes use (ADR 0032), with no disk and no HTTP.

const PANTIN_ID = "line";

export type BenchOptions = {
  physicsWorldFactory?: PhysicsWorldFactory;
  productLimit?: number;
};

function openBench(document: PantinDocument, options: BenchOptions = {}) {
  const context = createServiceContext(createPantinStore("/unused"), undefined, {
    physicsWorldFactory: options.physicsWorldFactory ?? testPhysicsWorldFactory,
    ...(options.productLimit === undefined ? {} : { productLimit: options.productLimit }),
    wallClock: () => new Date(0),
    newConsoleId: () => "console",
  });
  const openPantin = newOpenPantin(document, "console", context.physics.createWorld);
  openPantin.clock.running = false;
  context.openPantins.set(PANTIN_ID, Promise.resolve(openPantin));
  context.loadedPantins.set(PANTIN_ID, openPantin);
  return {
    context,
    openPantin,
    write: (tag: string, value: number) => writeTag(context, PANTIN_ID, tag, value),
    step: (steps: number) => runSteps(context, openPantin, steps),
    products: () => openPantin.physicsState.products,
    close: () => disposePhysics(openPantin),
    consoleCodes: () => openPantin.console.entries.map((entry) => entry.code),
  };
}

export type Bench = ReturnType<typeof openBench>;

/** `openBench` for a test file: every bench it opens is closed after each test. */
export function benchesClosedAfterEach(): (
  document: PantinDocument,
  options?: BenchOptions,
) => Bench {
  const opened: Bench[] = [];
  afterEach(() => {
    for (const bench of opened.splice(0)) {
      bench.close();
    }
  });
  return (document, options) => {
    const bench = openBench(document, options);
    opened.push(bench);
    return bench;
  };
}
