import type {
  CreateIoModuleRequest,
  IoDocument,
  IoModule,
  UpdateIoModuleRequest,
} from "@pantin/protocol";
import { IO_SCHEMA_VERSION } from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { nextModuleKey } from "./io-allocation.ts";
import { rulesOf } from "./io-transports.ts";

// The module edits of ADR 0049 point 4 and ADR 0064 point 6, on a mapping
// already parsed: pure, they return a new mapping or throw the ApiError the
// route answers with.

const EMPTY_MAPPING: IoDocument = { schema_version: IO_SCHEMA_VERSION, modules: [] };

/** The module a path names, or the 404 of the route. */
export function requireModule(document: IoDocument, moduleKey: string): IoModule {
  const module = document.modules.find((candidate) => candidate.key === moduleKey);
  if (module === undefined) {
    throw new ApiError(
      "not_found",
      `The mapping has no module "${moduleKey}". List them with GET /api/pantins/<id>/io.`,
    );
  }
  return module;
}

function listenPortsOf(modules: readonly IoModule[]): number[] {
  return modules.flatMap((module) => {
    const port = rulesOf(module.transport).listenPort(module.transport);
    return port === null ? [] : [port];
  });
}

function requirePortFree(modules: readonly IoModule[], port: number | null, moduleKey?: string) {
  const owner = modules.find(
    (module) =>
      module.key !== moduleKey && rulesOf(module.transport).listenPort(module.transport) === port,
  );
  if (port !== null && owner !== undefined) {
    throw new ApiError(
      "conflict",
      `Port ${port} is already used by module "${owner.key}": each module listens on its own port.`,
    );
  }
}

function requireKeyFree(modules: readonly IoModule[], key: string): void {
  if (modules.some((module) => module.key === key)) {
    throw new ApiError("conflict", `Module key "${key}" is already used.`);
  }
}

/** Adds a module with the smallest free key and port, and the transport's defaults. */
export function addModule(document: IoDocument | null, request: CreateIoModuleRequest): IoDocument {
  const base = document ?? EMPTY_MAPPING;
  if (request.key !== undefined) {
    requireKeyFree(base.modules, request.key);
  }
  const transport = rulesOf(request.transport).createTransport(
    request.transport,
    listenPortsOf(base.modules),
  );
  if (typeof transport === "string") {
    throw new ApiError("conflict", transport);
  }
  requirePortFree(base.modules, rulesOf(transport).listenPort(transport));
  const module: IoModule = {
    key: request.key ?? nextModuleKey(base.modules.map((existing) => existing.key)),
    transport,
    channels: [],
  };
  return { ...base, modules: [...base.modules, module] };
}

// A module keeps its transport: a channel's sub-object belongs to it.
function editedTransport(module: IoModule, request: UpdateIoModuleRequest): IoModule["transport"] {
  if (request.transport === undefined) {
    return module.transport;
  }
  if (request.transport.kind !== module.transport.kind) {
    throw new ApiError(
      "invalid_request",
      `Module "${module.key}" is a ${module.transport.kind} module: its transport cannot become ${request.transport.kind}. Create another module instead.`,
    );
  }
  return rulesOf(module.transport).patchTransport(module.transport, request.transport);
}

/** Edits or renames a module; the key and the listen port stay unique. */
export function updateModule(
  document: IoDocument,
  moduleKey: string,
  request: UpdateIoModuleRequest,
): IoDocument {
  const module = requireModule(document, moduleKey);
  if (request.key !== undefined && request.key !== moduleKey) {
    requireKeyFree(document.modules, request.key);
  }
  const transport = editedTransport(module, request);
  requirePortFree(document.modules, rulesOf(transport).listenPort(transport), moduleKey);
  const edited: IoModule = { ...module, key: request.key ?? module.key, transport };
  return {
    ...document,
    modules: document.modules.map((existing) => (existing === module ? edited : existing)),
  };
}

/** Removes a module and its channels. */
export function removeModule(document: IoDocument, moduleKey: string): IoDocument {
  requireModule(document, moduleKey);
  return { ...document, modules: document.modules.filter((module) => module.key !== moduleKey) };
}
