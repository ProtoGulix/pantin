import { readdir, readFile, readlink } from "node:fs/promises";

// Linux only: which sockets a process holds, and which sockets in the system listen (ADR 0065
// points 8 and 14). The kernel lists every TCP socket in /proc/net/tcp and /proc/net/tcp6.

const TCP_LISTEN_STATE = "0A";
const INODE_COLUMN = 9;
const STATE_COLUMN = 3;

/** The inodes of the TCP sockets in LISTEN state, from the text of /proc/net/tcp or tcp6. */
export function listeningInodes(tableText: string): string[] {
  return tableText
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((columns) => columns[STATE_COLUMN] === TCP_LISTEN_STATE)
    .flatMap((columns) => columns[INODE_COLUMN] ?? []);
}

/** The inodes of the sockets a process holds open, from the `socket:[inode]` file descriptors. */
export async function socketInodesOf(pid: number): Promise<string[]> {
  const descriptors = await readdir(`/proc/${pid}/fd`);
  const targets = await Promise.all(
    descriptors.map((descriptor) => readlink(`/proc/${pid}/fd/${descriptor}`).catch(() => "")),
  );
  return targets.flatMap((target) => /^socket:\[(\d+)\]$/.exec(target)?.[1] ?? []);
}

/** Every listening TCP socket of the system, IPv4 and IPv6. */
export async function systemListeningInodes(): Promise<string[]> {
  const tables = await Promise.all(
    ["/proc/net/tcp", "/proc/net/tcp6"].map((path) => readFile(path, "utf8")),
  );
  return tables.flatMap(listeningInodes);
}
