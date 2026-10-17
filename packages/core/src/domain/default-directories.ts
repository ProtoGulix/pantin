import { join } from "node:path";

// Where the core looks by default (ADR 0054 point 2), shared with the command
// line so that `pantin bridge-log` reads what the core wrote. Pure: the home
// directory is an argument.

const DEFAULT_PANTINS_DIRECTORY_NAME = "pantin-projects";
// Under the Pantins folder; not a valid Pantin id, so never read as a Pantin.
const DEFAULT_LOGS_DIRECTORY_NAME = ".logs";

export function defaultPantinsDirectory(homeDirectory: string): string {
  return join(homeDirectory, DEFAULT_PANTINS_DIRECTORY_NAME);
}

export function defaultLogsDirectory(pantinsDirectory: string): string {
  return join(pantinsDirectory, DEFAULT_LOGS_DIRECTORY_NAME);
}
