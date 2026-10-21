import { cp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { IoDocumentSchema } from "@pantin/protocol";

// examples/plc-cylinder copied into a pantins directory with its Modbus module
// moved to a port nobody holds, as packages/bridge/tests/test_closed_loop.py does.

export const PLC_CYLINDER_ID = "plc-cylinder";
const EXAMPLE = join(import.meta.dirname, "../../../../examples/plc-cylinder");

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

export async function copyPlcCylinder(pantinsDirectory: string, modbusPort: number) {
  const folder = join(pantinsDirectory, PLC_CYLINDER_ID);
  await cp(EXAMPLE, folder, { recursive: true });
  const ioPath = join(folder, "io.json");
  const document = IoDocumentSchema.parse(JSON.parse(await readFile(ioPath, "utf8")) as unknown);
  const [module, ...others] = document.modules;
  if (module === undefined || others.length > 0) {
    throw new Error("Expected examples/plc-cylinder to hold exactly one module.");
  }
  const transport = { ...module.transport, port: modbusPort };
  const moved = { ...document, modules: [{ ...module, transport }] };
  await writeFile(ioPath, JSON.stringify(moved, null, 2), "utf8");
}
