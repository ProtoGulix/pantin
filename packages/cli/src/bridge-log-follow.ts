// Following the bridge log file (ADR 0054 point 4): poll its size, print what
// was appended, and when the file shrank (the core rotated it to bridge.log.1)
// print the end of the rotated file, then the new one from its start. Disk and
// time are injected so that a test drives it step by step.

export type LogFileReader = {
  // undefined when the file does not exist.
  sizeOf(path: string): Promise<number | undefined>;
  // The bytes from `offset` to the end.
  readFrom(path: string, offset: number): Promise<Uint8Array>;
};

export type FollowClock = {
  sleep(milliseconds: number): Promise<void>;
  // Checked before each poll; false ends the follow.
  shouldContinue(): boolean;
};

const FOLLOW_POLL_MILLISECONDS = 500;

// Only complete lines are printed: a line the core is still writing waits for
// its newline, and `consumed` is how many bytes were taken.
export function completeLines(bytes: Uint8Array): { text: string; consumed: number } {
  const lastNewline = bytes.lastIndexOf(0x0a);
  if (lastNewline < 0) {
    return { text: "", consumed: 0 };
  }
  const consumed = lastNewline + 1;
  return { text: new TextDecoder().decode(bytes.subarray(0, consumed)), consumed };
}

async function printNew(
  reader: LogFileReader,
  path: string,
  offset: number,
  print: (text: string) => void,
): Promise<number> {
  const { text, consumed } = completeLines(await reader.readFrom(path, offset));
  if (text !== "") {
    print(text);
  }
  return offset + consumed;
}

export async function followLogFile(
  paths: { current: string; rotated: string },
  reader: LogFileReader,
  clock: FollowClock,
  print: (text: string) => void,
): Promise<void> {
  let offset = await printNew(reader, paths.current, 0, print);
  while (clock.shouldContinue()) {
    await clock.sleep(FOLLOW_POLL_MILLISECONDS);
    const size = await reader.sizeOf(paths.current);
    if (size === undefined) {
      continue;
    }
    if (size < offset) {
      await printNew(reader, paths.rotated, offset, print);
      offset = 0;
    }
    offset = await printNew(reader, paths.current, offset, print);
  }
}
