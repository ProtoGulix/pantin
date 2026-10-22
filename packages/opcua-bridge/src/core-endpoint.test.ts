import { describe, expect, it } from "vitest";
import {
  busUrlOf,
  type Fetcher,
  fetchProjection,
  ioUrlOf,
  parseCoreEndpoint,
} from "./core-endpoint.ts";
import { CoreUnavailableError, ProtocolError } from "./errors.ts";
import { opcuaProjection } from "./test-support/projection-fixtures.ts";

const ENDPOINT = parseCoreEndpoint("http://127.0.0.1:4800", "press");

function answering(body: string, status = 200): { fetcher: Fetcher; urls: string[] } {
  const urls: string[] = [];
  const fetcher: Fetcher = async (input) => {
    urls.push(String(input));
    return new Response(body, { status });
  };
  return { fetcher, urls };
}

describe("core endpoint", () => {
  it("builds the projection and bus URLs of the Pantin", () => {
    expect(ioUrlOf(ENDPOINT)).toBe(
      "http://127.0.0.1:4800/api/pantins/press/io?transport=opcua_client",
    );
    expect(busUrlOf(ENDPOINT)).toBe("ws://127.0.0.1:4800/api/pantins/press/bus");
  });

  it("puts an IPv6 core in brackets", () => {
    const endpoint = parseCoreEndpoint("http://[::1]:4800", "press");

    expect(busUrlOf(endpoint)).toBe("ws://[::1]:4800/api/pantins/press/bus");
  });

  it("reads the projection through the protocol schema", async () => {
    const projection = opcuaProjection();
    const { fetcher, urls } = answering(JSON.stringify(projection));

    expect(await fetchProjection(fetcher, ENDPOINT)).toEqual(projection);
    expect(urls).toEqual([ioUrlOf(ENDPOINT)]);
  });

  it("reports the core's own message when it answers an error", async () => {
    const { fetcher } = answering(
      JSON.stringify({ error: { code: "not_found", message: 'No Pantin "press".' } }),
      404,
    );

    await expect(fetchProjection(fetcher, ENDPOINT)).rejects.toThrow(
      /answered 404: No Pantin "press"\./,
    );
    await expect(fetchProjection(fetcher, ENDPOINT)).rejects.toThrow(CoreUnavailableError);
  });

  it("reports an error answer that is not JSON", async () => {
    const { fetcher } = answering("<html>", 502);

    await expect(fetchProjection(fetcher, ENDPOINT)).rejects.toThrow(/answered 502 \(/);
  });

  it("reports a core that cannot be reached", async () => {
    const fetcher: Fetcher = () => Promise.reject(new TypeError("fetch failed"));

    await expect(fetchProjection(fetcher, ENDPOINT)).rejects.toThrow(
      /Cannot reach the core.*Is it running\?/,
    );
  });

  it("refuses an answer that is not JSON or not a projection", async () => {
    await expect(fetchProjection(answering("nope").fetcher, ENDPOINT)).rejects.toThrow(
      ProtocolError,
    );
    await expect(
      fetchProjection(answering('{"status":"valid"}').fetcher, ENDPOINT),
    ).rejects.toThrow(/does not match the protocol/);
  });
});
