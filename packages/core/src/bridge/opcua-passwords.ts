import type { PantinId } from "@pantin/protocol";

// The OPC UA passwords the core holds (ADR 0065 point 9): per (Pantin, module), in this
// object only, never on disk, in a log or in a status. One store per supervisor, so two
// cores or two tests share nothing; `clear` runs when the core stops.
// A password is bound to the target it was given for: it is a secret of that PLC, so it never
// follows the module to another address.

export type PasswordStore = {
  /** A copy: the caller cannot change what the store holds. */
  of(pantinId: PantinId): Readonly<Record<string, string>>;
  /** Replaces the Pantin's passwords with these, each bound to its module's target. */
  replace(
    pantinId: PantinId,
    passwords: Readonly<Record<string, string>>,
    targets: Readonly<Record<string, string>>,
  ): void;
  /** Forgets every password whose module now has another target than the one it was given for. */
  forgetChangedTargets(pantinId: PantinId, targets: Readonly<Record<string, string>>): void;
  forget(pantinId: PantinId, moduleKey: string): void;
  clear(): void;
};

type StoredPassword = { password: string; target: string };

export function createPasswordStore(): PasswordStore {
  const byPantin = new Map<PantinId, Map<string, StoredPassword>>();
  return {
    of: (pantinId) =>
      Object.fromEntries(
        [...(byPantin.get(pantinId) ?? [])].map(([key, { password }]) => [key, password]),
      ),
    replace: (pantinId, passwords, targets) => {
      byPantin.set(
        pantinId,
        new Map(
          Object.entries(passwords).map(([key, password]) => [
            key,
            // No target never matches a real one, so such a password is forgotten at the next start.
            { password, target: targets[key] ?? "" },
          ]),
        ),
      );
    },
    forgetChangedTargets: (pantinId, targets) => {
      const stored = byPantin.get(pantinId);
      for (const [key, { target }] of stored ?? []) {
        if (targets[key] !== target) {
          stored?.delete(key);
        }
      }
    },
    forget: (pantinId, moduleKey) => {
      byPantin.get(pantinId)?.delete(moduleKey);
    },
    clear: () => byPantin.clear(),
  };
}
