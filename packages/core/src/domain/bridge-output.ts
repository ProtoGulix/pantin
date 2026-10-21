import {
  BRIDGE_MAX_LOG_LINE_CHARACTERS,
  BRIDGE_MAX_LOG_LINES,
  BRIDGE_MAX_STATUS_LINE_BYTES,
  type BridgeStatusLine,
  BridgeStatusLineSchema,
} from "@pantin/protocol";

// Reading what the bridge writes (ADR 0050 point 2). Pure: bytes in, lines and
// status lines out. The child's stdout is external data, so a status line goes
// through its Zod schema; anything else is a log line.

// A child that never writes a newline must not make the core buffer without bound.
const MAX_PENDING_CHARACTERS = 64 * 1024;

export type LineSplit = { lines: string[]; pending: string };

export function splitLines(pending: string, chunk: string): LineSplit {
  const parts = (pending + chunk).split("\n");
  const rest = parts.pop() ?? "";
  const lines = parts.map((line) => line.replace(/\r$/, ""));
  if (rest.length > MAX_PENDING_CHARACTERS) {
    return { lines: [...lines, rest], pending: "" };
  }
  return { lines, pending: rest };
}

// A line over 4 KiB, not JSON, or JSON the schema refuses is a log line.
export function parseStatusLine(line: string): BridgeStatusLine | undefined {
  if (Buffer.byteLength(line, "utf8") > BRIDGE_MAX_STATUS_LINE_BYTES) {
    return undefined;
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(line);
  } catch {
    return undefined;
  }
  const result = BridgeStatusLineSchema.safeParse(decoded);
  return result.success ? result.data : undefined;
}

export function truncateLogLine(line: string): string {
  return line.length > BRIDGE_MAX_LOG_LINE_CHARACTERS
    ? line.slice(0, BRIDGE_MAX_LOG_LINE_CHARACTERS)
    : line;
}

// The last 20 lines, each cut to 500 characters.
export function appendLogLine(log: readonly string[], line: string): string[] {
  return [...log, truncateLogLine(line)].slice(-BRIDGE_MAX_LOG_LINES);
}

function urlHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

// The arguments every bridge takes, after the launcher's own (ADR 0050 point 1, ADR 0065
// point 5): where the core is and which Pantin. The kind's own part comes after them.
export function commonBridgeArguments(options: {
  core: { host: string; port: number };
  pantinId: string;
}): string[] {
  const { core, pantinId } = options;
  return [
    "--status-lines",
    "--core",
    `http://${urlHost(core.host)}:${core.port}`,
    "--pantin",
    pantinId,
  ];
}

// `<host>:<port>`, with an IPv6 host in brackets.
export function hostAndPort(host: string, port: number): string {
  return `${urlHost(host)}:${port}`;
}
