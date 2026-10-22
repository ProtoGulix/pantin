import { describe, expect, it } from "vitest";
import { type GuardedStream, installStdoutGuard } from "./stdout-guard.ts";

type Written = { chunk: unknown; encoding?: unknown };

function recordingStream(): { stream: GuardedStream; written: Written[] } {
  const written: Written[] = [];
  const stream: GuardedStream = {
    write: ((chunk: unknown, encoding?: unknown, callback?: unknown) => {
      written.push({ chunk, encoding });
      const done = typeof encoding === "function" ? encoding : callback;
      if (typeof done === "function") {
        done();
      }
      return true;
    }) as GuardedStream["write"], // the fake implements the overloads of the one call shape used
  };
  return { stream, written };
}

describe("installStdoutGuard", () => {
  it("sends everything written on stdout to stderr", () => {
    const stdout = recordingStream();
    const stderr = recordingStream();
    installStdoutGuard(stdout.stream, stderr.stream);

    stdout.stream.write("text\n");
    stdout.stream.write(Buffer.from("bytes\n"));
    stdout.stream.write("with callback\n", () => undefined);

    expect(stdout.written).toHaveLength(0);
    expect(stderr.written.map((entry) => String(entry.chunk))).toEqual([
      "text\n",
      "bytes\n",
      "with callback\n",
    ]);
  });

  it("lets only the status line writer reach the original stdout", async () => {
    const stdout = recordingStream();
    const stderr = recordingStream();
    const writeStatusLine = installStdoutGuard(stdout.stream, stderr.stream);

    await writeStatusLine('{"event":"x"}');

    expect(stdout.written.map((entry) => entry.chunk)).toEqual(['{"event":"x"}\n']);
    expect(stderr.written).toHaveLength(0);
  });
});
