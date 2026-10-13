import type { PantinResponse } from "@pantin/protocol";
import type { ConveyorKind } from "../conveyors/conveyor-kinds.ts";
import type { ConveyorRequest } from "../conveyors/conveyor-request.ts";
import type { ViewerStore } from "./viewer-store.ts";

// Which API call a kind of phase 6 object uses, so that the form, the grid
// edits and the delete command share one place that names them.

/** Creates the object, or replaces the one with this id; resolves with what the core stored. */
export function saveConveyor(
  store: ViewerStore,
  pantinId: string,
  request: ConveyorRequest,
  id: string | null,
): Promise<{ id: string; name: string }> {
  const { api } = store.ports;
  switch (request.kind) {
    case "belt":
      return id === null
        ? api.createBelt(pantinId, request.request)
        : api.updateBelt(pantinId, id, request.request);
    case "guide":
      return id === null
        ? api.createGuide(pantinId, request.request)
        : api.updateGuide(pantinId, id, request.request);
    case "emitter":
      return id === null
        ? api.createEmitter(pantinId, request.request)
        : api.updateEmitter(pantinId, id, request.request);
    case "absorber":
      return id === null
        ? api.createAbsorber(pantinId, request.request)
        : api.updateAbsorber(pantinId, id, request.request);
    case "presenceSensor":
      return id === null
        ? api.createPresenceSensor(pantinId, request.request)
        : api.updatePresenceSensor(pantinId, id, request.request);
  }
}

export function removeConveyor(
  store: ViewerStore,
  pantinId: string,
  kind: ConveyorKind,
  id: string,
): Promise<PantinResponse> {
  const { api } = store.ports;
  switch (kind) {
    case "belt":
      return api.deleteBelt(pantinId, id);
    case "guide":
      return api.deleteGuide(pantinId, id);
    case "emitter":
      return api.deleteEmitter(pantinId, id);
    case "absorber":
      return api.deleteAbsorber(pantinId, id);
    case "presenceSensor":
      return api.deletePresenceSensor(pantinId, id);
  }
}
