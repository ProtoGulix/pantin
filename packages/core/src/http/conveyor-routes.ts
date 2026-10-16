import {
  AbsorberIdSchema,
  BeltIdSchema,
  CreateAbsorberRequestSchema,
  CreateBeltRequestSchema,
  CreateEmitterRequestSchema,
  CreateGuideRequestSchema,
  CreatePresenceSensorRequestSchema,
  EmitterIdSchema,
  GuideIdSchema,
  type PantinId,
  type PantinResponse,
  PresenceSensorIdSchema,
} from "@pantin/protocol";
import { type Parser, parseWithSchema } from "../domain/validation.ts";
import type { PantinService } from "../service/pantin-service.ts";
import { readJsonBody } from "./request-reading.ts";
import { sendJson } from "./responses.ts";
import { pantinIdOf, type Route } from "./route-context.ts";

// Belts, guides, emitters, absorbers and presence sensors (ADR 0043 point 12),
// and the runtime reset; the contract is in conveyor-api.ts. The five kinds
// have the same three routes, so one function builds them from a description.

type KindRoutes<Request, Item> = {
  segment: string;
  // What the errors call the request body and the id in the URL.
  what: string;
  requestSchema: Parser<Request>;
  idSchema: Parser<string>;
  create: (service: PantinService, pantinId: PantinId, request: Request) => Promise<Item>;
  update: (
    service: PantinService,
    pantinId: PantinId,
    id: string,
    request: Request,
  ) => Promise<Item>;
  remove: (service: PantinService, pantinId: PantinId, id: string) => Promise<PantinResponse>;
  // The response body around the item: `{ belt }`.
  wrap: (item: Item) => object;
};

function routesOf<Request, Item>(kind: KindRoutes<Request, Item>): Route[] {
  const collection = ["pantins", ":pantinId", kind.segment];
  const member = [...collection, ":itemId"];
  const idOf = (parameters: Record<string, string>) =>
    parseWithSchema(kind.idSchema, parameters.itemId, `The ${kind.what} id in the URL`);
  const bodyOf = async (request: Parameters<typeof readJsonBody>[0]) =>
    parseWithSchema(kind.requestSchema, await readJsonBody(request), `The ${kind.what}`);
  return [
    {
      method: "POST",
      pattern: collection,
      handle: async (context) => {
        const request = await bodyOf(context.request);
        const item = await kind.create(context.service, pantinIdOf(context), request);
        sendJson(context.response, 201, kind.wrap(item));
      },
    },
    {
      method: "PATCH",
      pattern: member,
      handle: async (context) => {
        const request = await bodyOf(context.request);
        const id = idOf(context.parameters);
        const item = await kind.update(context.service, pantinIdOf(context), id, request);
        sendJson(context.response, 200, kind.wrap(item));
      },
    },
    {
      method: "DELETE",
      pattern: member,
      handle: async (context) =>
        sendJson(
          context.response,
          200,
          await kind.remove(context.service, pantinIdOf(context), idOf(context.parameters)),
        ),
    },
  ];
}

// Products go at once, not at the next tick: a paused clock sends no pose.
const RESET_ROUTE: Route = {
  method: "POST",
  pattern: ["pantins", ":pantinId", "reset"],
  handle: async (context) => {
    const pantinId = pantinIdOf(context);
    const answer = await context.service.resetRuntime(pantinId);
    context.poseStreams.notifyClockChange(pantinId, { withPose: true });
    sendJson(context.response, 200, answer);
  },
};

export const CONVEYOR_ROUTES: readonly Route[] = [
  ...routesOf({
    segment: "belts",
    what: "belt",
    requestSchema: CreateBeltRequestSchema,
    idSchema: BeltIdSchema,
    create: (service, pantinId, request) => service.createBelt(pantinId, request),
    update: (service, pantinId, id, request) => service.updateBelt(pantinId, id, request),
    remove: (service, pantinId, id) => service.deleteBelt(pantinId, id),
    wrap: (belt) => ({ belt }),
  }),
  ...routesOf({
    segment: "guides",
    what: "guide",
    requestSchema: CreateGuideRequestSchema,
    idSchema: GuideIdSchema,
    create: (service, pantinId, request) => service.createGuide(pantinId, request),
    update: (service, pantinId, id, request) => service.updateGuide(pantinId, id, request),
    remove: (service, pantinId, id) => service.deleteGuide(pantinId, id),
    wrap: (guide) => ({ guide }),
  }),
  ...routesOf({
    segment: "emitters",
    what: "emitter",
    requestSchema: CreateEmitterRequestSchema,
    idSchema: EmitterIdSchema,
    create: (service, pantinId, request) => service.createEmitter(pantinId, request),
    update: (service, pantinId, id, request) => service.updateEmitter(pantinId, id, request),
    remove: (service, pantinId, id) => service.deleteEmitter(pantinId, id),
    wrap: (emitter) => ({ emitter }),
  }),
  ...routesOf({
    segment: "absorbers",
    what: "absorber",
    requestSchema: CreateAbsorberRequestSchema,
    idSchema: AbsorberIdSchema,
    create: (service, pantinId, request) => service.createAbsorber(pantinId, request),
    update: (service, pantinId, id, request) => service.updateAbsorber(pantinId, id, request),
    remove: (service, pantinId, id) => service.deleteAbsorber(pantinId, id),
    wrap: (absorber) => ({ absorber }),
  }),
  ...routesOf({
    segment: "presence-sensors",
    what: "presence sensor",
    requestSchema: CreatePresenceSensorRequestSchema,
    idSchema: PresenceSensorIdSchema,
    create: (service, pantinId, request) => service.createPresenceSensor(pantinId, request),
    update: (service, pantinId, id, request) => service.updatePresenceSensor(pantinId, id, request),
    remove: (service, pantinId, id) => service.deletePresenceSensor(pantinId, id),
    wrap: (presenceSensor) => ({ presenceSensor }),
  }),
  RESET_ROUTE,
];
