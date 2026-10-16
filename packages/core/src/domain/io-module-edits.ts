import type {
  CreateIoModuleRequest,
  IoDocument,
  IoModule,
  UpdateIoModuleRequest,
} from "@pantin/protocol";
import { IO_SCHEMA_VERSION } from "@pantin/protocol";
import { ApiError } from "../errors.ts";
import { nextModuleKey, smallestFreePort } from "./io-allocation.ts";

// The module edits of ADR 0049 point 4, on a mapping already parsed: pure,
// they return a new mapping or throw the ApiError the route answers with.

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

function requirePortFree(modules: readonly IoModule[], port: number, moduleKey?: string): void {
  const owner = modules.find((module) => module.port === port && module.key !== moduleKey);
  if (owner !== undefined) {
    throw new ApiError(
      "conflict",
      `Port ${port} is already used by module "${owner.key}": each module listens on its own port.`,
    );
  }
}

/** Adds a module with the smallest free key and port, and the ADR 0045 defaults. */
export function addModule(document: IoDocument | null, request: CreateIoModuleRequest): IoDocument {
  const base = document ?? EMPTY_MAPPING;
  const port = request.port ?? smallestFreePort(base.modules.map((module) => module.port));
  if (port === null) {
    throw new ApiError("conflict", "Every port from 1502 to 65535 is used: remove a module.");
  }
  requirePortFree(base.modules, port);
  const module: IoModule = {
    key: nextModuleKey(base.modules.map((existing) => existing.key)),
    port,
    unitId: request.unitId ?? 1,
    wordOrder: request.wordOrder ?? "low_word_first",
    watchdogMilliseconds: request.watchdogMilliseconds ?? 1000,
    channels: [],
  };
  return { ...base, modules: [...base.modules, module] };
}

/** Edits or renames a module; the key and the port stay unique. */
export function updateModule(
  document: IoDocument,
  moduleKey: string,
  request: UpdateIoModuleRequest,
): IoDocument {
  requireModule(document, moduleKey);
  if (request.key !== undefined && request.key !== moduleKey) {
    if (document.modules.some((module) => module.key === request.key)) {
      throw new ApiError("conflict", `Module key "${request.key}" is already used.`);
    }
  }
  if (request.port !== undefined) {
    requirePortFree(document.modules, request.port, moduleKey);
  }
  return {
    ...document,
    modules: document.modules.map((module) =>
      module.key === moduleKey ? { ...module, ...definedFields(request) } : module,
    ),
  };
}

// An absent field means "unchanged": spreading `undefined` would erase it.
function definedFields(request: UpdateIoModuleRequest): Partial<IoModule> {
  return Object.fromEntries(Object.entries(request).filter(([, value]) => value !== undefined));
}

/** Removes a module and its channels. */
export function removeModule(document: IoDocument, moduleKey: string): IoDocument {
  requireModule(document, moduleKey);
  return { ...document, modules: document.modules.filter((module) => module.key !== moduleKey) };
}
