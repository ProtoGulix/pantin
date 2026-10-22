import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

/** A folder under the system temporary folder, removed when the test file ends. */
export function temporaryFolders(): () => Promise<string> {
  const created: string[] = [];
  afterAll(async () => {
    await Promise.all(created.map((folder) => rm(folder, { recursive: true, force: true })));
  });
  return async () => {
    const folder = await mkdtemp(join(tmpdir(), "pantin-opcua-bridge-"));
    created.push(folder);
    return folder;
  };
}
