// stdout carries status lines only (ADR 0065 point 1): the core reads every stdout line as a
// status line, so a library that prints there would be read as one. node-opcua prints with
// console.log by default, and some of its dependencies print on their own.
//
// This is the one piece of global state of the bridge, and it is on purpose: the guard
// replaces `process.stdout.write` itself, because that is the only place all of those writers
// have in common. It must run before node-opcua is imported (see main.ts). The function that
// writes a status line holds the original `write`, so it is the only way left to stdout.

type StreamWrite = NodeJS.WriteStream["write"];
type Callback = (error?: Error | null) => void;

export type GuardedStream = { write: StreamWrite };

/** Writes one status line (a newline is added) on the real stdout; settles when it is flushed. */
export type StatusLineWriter = (line: string) => Promise<void>;

export function installStdoutGuard(stdout: GuardedStream, stderr: GuardedStream): StatusLineWriter {
  const originalWrite = stdout.write.bind(stdout);
  stdout.write = (
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | Callback,
    callback?: Callback,
  ): boolean =>
    typeof encodingOrCallback === "function"
      ? stderr.write(chunk, encodingOrCallback)
      : stderr.write(chunk, encodingOrCallback, callback);
  return (line) =>
    new Promise((resolve, reject) => {
      originalWrite(`${line}\n`, "utf8", (error) => (error ? reject(error) : resolve()));
    });
}
