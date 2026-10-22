import { classifyAddress } from "@pantin/network-address";
import {
  ApiErrorResponseSchema,
  type IoMappingResponse,
  IoMappingResponseSchema,
  OPCUA_CLIENT_KIND,
} from "@pantin/protocol";
import { ConfigurationError, CoreUnavailableError, ProtocolError } from "./errors.ts";

// Where the core is, and the one REST call the bridge makes (ADR 0045 point 10, ADR 0065
// point 7).

const REQUEST_TIMEOUT_MILLISECONDS = 10_000;
// The answer is two small tables (each file at most 1 MiB, ADR 0045 point 6) as JSON.
const MAX_ANSWER_BYTES = 8 * 1024 * 1024;

export type CoreEndpoint = {
  /** `host:port`, with brackets around an IPv6 address. */
  authority: string;
  pantinId: string;
};

function unbracketed(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

/** ADR 0046 point 8: clear text, so only http:// to a loopback or private address. */
export function parseCoreEndpoint(coreUrl: string, pantinId: string): CoreEndpoint {
  const url = URL.parse(coreUrl);
  if (
    url === null ||
    url.protocol !== "http:" ||
    url.hostname === "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new ConfigurationError(
      `--core "${coreUrl}" must be http://<address>:<port>, with no path (ADR 0046 point 8).`,
    );
  }
  const host = unbracketed(url.hostname);
  // "localhost" is the one name accepted: every resolver maps it to loopback.
  const addressClass = classifyAddress(host);
  if (host !== "localhost" && addressClass !== "loopback" && addressClass !== "private") {
    throw new ConfigurationError(
      `--core ${host} is not a loopback or private address: the bridge talks to the core in clear text and runs on the core's host (ADR 0046 point 8).`,
    );
  }
  return { authority: url.host, pantinId };
}

export function ioUrlOf(endpoint: CoreEndpoint): string {
  // The projection of the mapping on the one transport this bridge serves, so that the
  // modules of another transport can neither block nor stop it (ADR 0065 point 7).
  const pantin = encodeURIComponent(endpoint.pantinId);
  return `http://${endpoint.authority}/api/pantins/${pantin}/io?transport=${OPCUA_CLIENT_KIND}`;
}

export function busUrlOf(endpoint: CoreEndpoint): string {
  return `ws://${endpoint.authority}/api/pantins/${encodeURIComponent(endpoint.pantinId)}/bus`;
}

export type Fetcher = typeof fetch;

async function errorDetail(response: Response): Promise<string> {
  try {
    const parsed = ApiErrorResponseSchema.safeParse(
      JSON.parse((await response.text()).slice(0, 4096)),
    );
    return parsed.success ? `: ${parsed.data.error.message}` : "";
  } catch {
    return "";
  }
}

async function readLimitedText(response: Response): Promise<string> {
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_ANSWER_BYTES) {
    throw new ProtocolError("The io answer is larger than 8 MiB.");
  }
  return text;
}

async function fetchResponse(fetcher: Fetcher, url: string): Promise<Response> {
  try {
    // fetch follows no proxy variable in Node, and the child's environment has none (ADR 0046
    // point 8). Redirects are refused: the core never redirects.
    return await fetcher(url, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CoreUnavailableError(`Cannot reach the core at ${url}: ${reason}. Is it running?`);
  }
}

/** GET .../io?transport=opcua_client, validated by the protocol schema. */
export async function fetchProjection(
  fetcher: Fetcher,
  endpoint: CoreEndpoint,
): Promise<IoMappingResponse> {
  const url = ioUrlOf(endpoint);
  const response = await fetchResponse(fetcher, url);
  if (!response.ok) {
    throw new CoreUnavailableError(
      `The core answered ${response.status}${await errorDetail(response)} (${url})`,
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(await readLimitedText(response));
  } catch (error) {
    if (error instanceof ProtocolError) {
      throw error;
    }
    throw new ProtocolError("The io answer is not JSON.");
  }
  const parsed = IoMappingResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ProtocolError(`The io answer does not match the protocol: ${parsed.error.message}`);
  }
  return parsed.data;
}
