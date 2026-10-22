import { installStdoutGuard } from "../stdout-guard.ts";

// A child process for the stdout guard test: everything that could write on stdout does, in
// the order main.ts uses (guard first, node-opcua loaded after), then one status line is written.
const writeStatusLine = installStdoutGuard(process.stdout, process.stderr);
const { make_warningLog } = await import("node-opcua-client");

// biome-ignore lint/suspicious/noConsole: the probe checks that console.log cannot reach stdout.
console.log("noise from console.log");
process.stdout.write("noise from process.stdout.write\n");
// node-opcua's own default warning logger prints with console.log.
make_warningLog("probe")("noise from the node-opcua logger");
await writeStatusLine(
  JSON.stringify({
    event: "exiting",
    kind: "unexpected",
    message: "probe done",
    certificate: null,
    module: null,
  }),
);
