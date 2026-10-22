import { describe, expect, it } from "vitest";
import { ConfigurationError } from "./errors.ts";
import { readPasswords } from "./stdin-passwords.ts";

const MARKER = "marker-password-9f3a";

async function* chunks(...parts: string[]): AsyncGenerator<string> {
  for (const part of parts) {
    yield part;
  }
}

async function failureOf(text: string): Promise<string> {
  try {
    await readPasswords(chunks(text), true);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigurationError);
    return (error as ConfigurationError).message;
  }
  throw new Error("The line was accepted.");
}

describe("readPasswords", () => {
  it("reads the line to EOF, however it is cut into chunks", async () => {
    const passwords = await readPasswords(
      chunks('{"passwords":{"plc":"s3', 'cret","spare":"é"}}', "\n"),
      true,
    );

    expect([...passwords]).toEqual([
      ["plc", "s3cret"],
      ["spare", "é"],
    ]);
  });

  it("accepts the empty line the core writes when no module logs in", async () => {
    expect((await readPasswords(chunks('{"passwords":{}}\n'), true)).size).toBe(0);
  });

  it("reads bytes as well as text", async () => {
    async function* bytes(): AsyncGenerator<Uint8Array> {
      yield new TextEncoder().encode('{"passwords":{"plc":"x"}}');
    }

    expect((await readPasswords(bytes(), true)).get("plc")).toBe("x");
  });

  it("reads nothing without --status-lines, so that a terminal run never waits", async () => {
    const neverRead: AsyncIterable<string> = {
      [Symbol.asyncIterator]: () => {
        throw new Error("stdin was read");
      },
    };

    expect((await readPasswords(neverRead, false)).size).toBe(0);
  });

  it.each([
    ["text that is not JSON", `not json ${MARKER}`],
    ["no passwords object", `{"other":"${MARKER}"}`],
    ["an unknown field", `{"passwords":{},"junk":"${MARKER}"}`],
    ["a password that is not text", `{"passwords":{"plc":["${MARKER}"]}}`],
    ["an empty password", `{"passwords":{"plc":""}}`],
    ["a module key that is not a key", `{"passwords":{"Not A Key":"${MARKER}"}}`],
  ])("refuses %s, and never repeats a password in its message", async (_name, text) => {
    const message = await failureOf(text);

    expect(message).not.toContain(MARKER);
  });

  it("refuses an empty stdin", async () => {
    expect(await failureOf("")).toMatch(/not JSON/);
  });

  it("refuses a line larger than 256 KiB", async () => {
    expect(await failureOf(`{"passwords":{"plc":"${"a".repeat(300 * 1024)}"}}`)).toMatch(/256 KiB/);
  });
});
