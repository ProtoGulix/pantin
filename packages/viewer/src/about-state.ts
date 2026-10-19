// What the About window knows of the core (ADR 0058 point 4): read each time it opens.
export type CoreVersionState =
  | { status: "loading" }
  | { status: "known"; version: string }
  | { status: "unreachable" };

export interface AboutState {
  open: boolean;
  core: CoreVersionState;
}

export const CLOSED_ABOUT: AboutState = { open: false, core: { status: "loading" } };
