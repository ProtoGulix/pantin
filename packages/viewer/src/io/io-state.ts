import type { IoMappingResponse } from "@pantin/protocol";

// The state of the I/O view (ADR 0049 point 11): the core's last mapping
// answer and what the user selected. Display state apart from the mapping,
// which the core owns and which is never edited here, only re-read.

// Asks the view to focus one cell. The serial makes a second request for the
// same cell a new one, since a redraw alone must not move the focus.
export interface IoFocusRequest {
  cellId: string;
  serial: number;
}

export interface IoState {
  // The Pantin the mapping belongs to: an answer for another one is dropped.
  pantinId: string | null;
  mapping: IoMappingResponse | null;
  selectedModuleKey: string | null;
  focus: IoFocusRequest | null;
}

export const NO_IO_STATE: IoState = {
  pantinId: null,
  mapping: null,
  selectedModuleKey: null,
  focus: null,
};

/** The selected module's key, or the first module's when the choice is gone. */
export function effectiveModuleKey(state: IoState): string | null {
  const modules = state.mapping?.modules ?? [];
  const chosen = modules.find((module) => module.key === state.selectedModuleKey);
  return (chosen ?? modules[0])?.key ?? null;
}

/** A fresh mapping answer; the selection follows a renamed or removed module. */
export function withMapping(state: IoState, pantinId: string, mapping: IoMappingResponse): IoState {
  const sameModule = state.pantinId === pantinId ? state.selectedModuleKey : null;
  const stillThere = mapping.modules.some((module) => module.key === sameModule);
  return {
    ...state,
    pantinId,
    mapping,
    selectedModuleKey: stillThere ? sameModule : (mapping.modules[0]?.key ?? null),
  };
}
