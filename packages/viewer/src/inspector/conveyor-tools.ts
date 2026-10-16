import type { PantinDocument } from "@pantin/protocol";
import { conveyorCreationProblem } from "../conveyors/conveyor-fields.ts";
import { CONVEYOR_KINDS, type ConveyorKind } from "../conveyors/conveyor-kinds.ts";
import type { DeviceRef } from "../device-selection.ts";
import type { Translate } from "../i18n/translate.ts";

// The create buttons of the inspector's tool bar for the phase 6 objects (ADR
// 0043 point 13), and the emitter's "Créer un produit" button, as data.

export interface ConveyorToolView {
  kind: ConveyorKind;
  label: string;
  // Why the button is off (no assembly, no drum joint), or null when it works.
  disabledReason: string | null;
}

export function conveyorToolViews(document: PantinDocument, t: Translate): ConveyorToolView[] {
  return CONVEYOR_KINDS.map((kind) => {
    const problem = conveyorCreationProblem(document, kind);
    return {
      kind,
      label: t(`conveyors.new.${kind}`),
      disabledReason: problem === null ? null : t(`conveyors.${problem}`),
    };
  });
}

export interface SpawnView {
  emitterId: string;
  label: string;
  hint: string;
}

/** The button of a selected emitter that asks for one product; null for anything else. */
export function spawnViewOf(device: DeviceRef | null, t: Translate): SpawnView | null {
  return device?.kind === "emitter"
    ? { emitterId: device.id, label: t("conveyors.spawn"), hint: t("conveyors.spawn.hint") }
    : null;
}
