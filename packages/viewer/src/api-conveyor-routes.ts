import {
  type Absorber,
  AbsorberResponseSchema,
  type Belt,
  BeltResponseSchema,
  type CreateAbsorberRequest,
  CreateAbsorberRequestSchema,
  type CreateBeltRequest,
  CreateBeltRequestSchema,
  type CreateEmitterRequest,
  CreateEmitterRequestSchema,
  type CreateGuideRequest,
  CreateGuideRequestSchema,
  type CreatePresenceSensorRequest,
  CreatePresenceSensorRequestSchema,
  type Emitter,
  EmitterResponseSchema,
  type Guide,
  GuideResponseSchema,
  type PantinResponse,
  PantinResponseSchema,
  type PresenceSensor,
  PresenceSensorResponseSchema,
  type RenamedTagsResponse,
  RenamedTagsResponseSchema,
} from "@pantin/protocol";
import {
  jsonRequest,
  pantinUrl,
  type Schema,
  type SendJson,
  validInputOrThrow,
} from "./api-transport.ts";

// Belt, guide, emitter, absorber and presence sensor routes of the API client,
// and the reset route (ADR 0043 point 12). Editing replaces the whole object
// but its id (and its tag key); the core derives ids from names.

export interface ConveyorRoutes {
  createBelt(pantinId: string, request: CreateBeltRequest): Promise<Belt>;
  updateBelt(pantinId: string, beltId: string, request: CreateBeltRequest): Promise<Belt>;
  deleteBelt(pantinId: string, beltId: string): Promise<PantinResponse>;
  createGuide(pantinId: string, request: CreateGuideRequest): Promise<Guide>;
  updateGuide(pantinId: string, guideId: string, request: CreateGuideRequest): Promise<Guide>;
  deleteGuide(pantinId: string, guideId: string): Promise<PantinResponse>;
  createEmitter(pantinId: string, request: CreateEmitterRequest): Promise<Emitter>;
  updateEmitter(
    pantinId: string,
    emitterId: string,
    request: CreateEmitterRequest,
  ): Promise<Emitter>;
  deleteEmitter(pantinId: string, emitterId: string): Promise<PantinResponse>;
  createAbsorber(pantinId: string, request: CreateAbsorberRequest): Promise<Absorber>;
  updateAbsorber(
    pantinId: string,
    absorberId: string,
    request: CreateAbsorberRequest,
  ): Promise<Absorber>;
  deleteAbsorber(pantinId: string, absorberId: string): Promise<PantinResponse>;
  createPresenceSensor(
    pantinId: string,
    request: CreatePresenceSensorRequest,
  ): Promise<PresenceSensor>;
  // The type of a presence sensor may change.
  updatePresenceSensor(
    pantinId: string,
    presenceSensorId: string,
    request: CreatePresenceSensorRequest,
  ): Promise<PresenceSensor>;
  deletePresenceSensor(pantinId: string, presenceSensorId: string): Promise<PantinResponse>;
  // Like drives and joint sensors: the answer lists the tags that changed name.
  renameEmitterTagKey(
    pantinId: string,
    emitterId: string,
    tagKey: string,
  ): Promise<RenamedTagsResponse>;
  renamePresenceSensorTagKey(
    pantinId: string,
    presenceSensorId: string,
    tagKey: string,
  ): Promise<RenamedTagsResponse>;
  // Back to the reference configuration: no product, command, motion or fault.
  // The unsaved edits and the clock stay; discard is the route that reloads.
  resetPantin(pantinId: string): Promise<PantinResponse>;
}

// The three routes every kind has; `segment` is its URL part.
function kindRoutes<Request, Response, Item>(
  send: SendJson,
  segment: string,
  requestSchema: Schema<Request>,
  responseSchema: Schema<Response>,
  itemOf: (response: Response) => Item,
) {
  const itemUrl = (pantinId: string, id: string) =>
    pantinUrl(pantinId, `/${segment}/${encodeURIComponent(id)}`);
  return {
    create: async (pantinId: string, request: Request) => {
      const valid = validInputOrThrow(requestSchema, request);
      const url = pantinUrl(pantinId, `/${segment}`);
      return itemOf(await send(url, jsonRequest("POST", valid), responseSchema));
    },
    update: async (pantinId: string, id: string, request: Request) => {
      const valid = validInputOrThrow(requestSchema, request);
      return itemOf(await send(itemUrl(pantinId, id), jsonRequest("PATCH", valid), responseSchema));
    },
    remove: (pantinId: string, id: string) =>
      send(itemUrl(pantinId, id), jsonRequest("DELETE"), PantinResponseSchema),
    // Sent as typed: the core suggests a valid key for a bad one (ADR 0019).
    renameTagKey: (pantinId: string, id: string, tagKey: string) =>
      send(
        `${itemUrl(pantinId, id)}/tag-key`,
        jsonRequest("PUT", { tagKey }),
        RenamedTagsResponseSchema,
      ),
  };
}

function beltAndGuideRoutes(send: SendJson) {
  const belts = kindRoutes(
    send,
    "belts",
    CreateBeltRequestSchema,
    BeltResponseSchema,
    (r) => r.belt,
  );
  const guides = kindRoutes(
    send,
    "guides",
    CreateGuideRequestSchema,
    GuideResponseSchema,
    (r) => r.guide,
  );
  return {
    createBelt: belts.create,
    updateBelt: belts.update,
    deleteBelt: belts.remove,
    createGuide: guides.create,
    updateGuide: guides.update,
    deleteGuide: guides.remove,
  };
}

function emitterAndAbsorberRoutes(send: SendJson) {
  const emitters = kindRoutes(
    send,
    "emitters",
    CreateEmitterRequestSchema,
    EmitterResponseSchema,
    (r) => r.emitter,
  );
  const absorbers = kindRoutes(
    send,
    "absorbers",
    CreateAbsorberRequestSchema,
    AbsorberResponseSchema,
    (r) => r.absorber,
  );
  return {
    createEmitter: emitters.create,
    updateEmitter: emitters.update,
    deleteEmitter: emitters.remove,
    renameEmitterTagKey: emitters.renameTagKey,
    createAbsorber: absorbers.create,
    updateAbsorber: absorbers.update,
    deleteAbsorber: absorbers.remove,
  };
}

export function conveyorRoutes(send: SendJson): ConveyorRoutes {
  const sensors = kindRoutes(
    send,
    "presence-sensors",
    CreatePresenceSensorRequestSchema,
    PresenceSensorResponseSchema,
    (r) => r.presenceSensor,
  );
  return {
    ...beltAndGuideRoutes(send),
    ...emitterAndAbsorberRoutes(send),
    createPresenceSensor: sensors.create,
    updatePresenceSensor: sensors.update,
    deletePresenceSensor: sensors.remove,
    renamePresenceSensorTagKey: sensors.renameTagKey,
    resetPantin: (pantinId) =>
      send(pantinUrl(pantinId, "/reset"), jsonRequest("POST"), PantinResponseSchema),
  };
}
