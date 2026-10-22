import {
  OPCUA_CLIENT_KIND,
  type PlcModuleLossReason,
  TAG_BUS_CLOSE_CODES,
  TAG_BUS_MAX_MESSAGE_BYTES,
  TAG_BUS_VERSION,
  type TagBusClientMessage,
  type TagBusServerMessage,
  TagBusServerMessageSchema,
} from "@pantin/protocol";
import { type RawData, WebSocket } from "ws";
import { deferred } from "./deferred.ts";
import { type BridgeError, BusClosedError, CoreUnavailableError, ProtocolError } from "./errors.ts";

// The bridge's side of the tag bus (ADR 0045 point 4, version 2 of ADR 0065 point 7): open,
// hello as the `opcua_client` plc, send, receive. Every incoming frame goes through the
// protocol schema before the bridge looks at it.

const OPEN_TIMEOUT_MILLISECONDS = 10_000;
const WELCOME_TIMEOUT_MILLISECONDS = 10_000;
// A full buffer means the core stopped reading: that is fatal, not something to wait out.
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
const PROTOCOL_ERROR_CLOSE_CODE = 1002;

const CLOSE_MEANINGS: Readonly<Record<number, string>> = {
  [TAG_BUS_CLOSE_CODES.invalidMessage]:
    "the core refused a message of the bridge (a bug: report it)",
  [TAG_BUS_CLOSE_CODES.unsupportedVersion]: "the core does not speak this tag bus version",
  [TAG_BUS_CLOSE_CODES.plcAlreadyConnected]:
    "another bridge of this transport is connected to this Pantin",
  [TAG_BUS_CLOSE_CODES.mappingMismatch]:
    "the io mapping changed since the bridge read it, or is not valid",
  [TAG_BUS_CLOSE_CODES.helloTimeout]: "the core got no hello in time",
  [TAG_BUS_CLOSE_CODES.roleNotAccepted]: "the core accepts the plc role from its own host only",
};

type Welcome = Extract<TagBusServerMessage, { type: "welcome" }>;

type PlcStatus = { connected: true } | { connected: false; reason: PlcModuleLossReason };

export type BusClient = {
  welcome: Welcome;
  subscribe(tags: readonly string[]): void;
  write(tag: string, value: number): void;
  plcStatus(module: string, status: PlcStatus): void;
  /** One listener: the bridge's message handler. */
  onMessage(listener: (message: TagBusServerMessage) => void): void;
  /** Settles, never rejects, with the reason the bus ended; any end is an error here. */
  ended: Promise<BridgeError>;
  close(): Promise<void>;
};

function closedError(code: number | undefined, reason: string): BusClosedError {
  if (code === undefined || code === 1006) {
    return new BusClosedError("The tag bus connection was lost. Restart the bridge.");
  }
  const meaning = CLOSE_MEANINGS[code] ?? "the core closed the bus";
  return new BusClosedError(
    `The tag bus was closed (${code}: ${meaning}; ${reason === "" ? "no reason" : reason}). Restart the bridge.`,
  );
}

function decodeFrame(data: RawData, isBinary: boolean): TagBusServerMessage | "ignored" {
  if (isBinary) {
    throw new ProtocolError("The core sent a binary frame: the tag bus is text only.");
  }
  let document: unknown;
  try {
    document = JSON.parse(data.toString("utf8"));
  } catch {
    throw new ProtocolError("The core sent a frame that is not JSON.");
  }
  // Console entries only inform the log, and a newer core may add codes this bridge does not
  // know: they are skipped unread. Every other message stays strictly validated.
  if (typeof document === "object" && document !== null && "type" in document) {
    if (document.type === "console") {
      return "ignored";
    }
  }
  const parsed = TagBusServerMessageSchema.safeParse(document);
  if (!parsed.success) {
    throw new ProtocolError(
      `The core sent a message the protocol refuses: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    // No Origin header is sent by default, which is how the core knows a non-browser client
    // (ADR 0046 point 5). Compression off: frames are tiny and latency matters.
    const socket = new WebSocket(url, {
      perMessageDeflate: false,
      maxPayload: TAG_BUS_MAX_MESSAGE_BYTES,
      handshakeTimeout: OPEN_TIMEOUT_MILLISECONDS,
      followRedirects: false,
    });
    socket.once("open", () => resolve(socket));
    socket.once("error", (error) =>
      reject(new CoreUnavailableError(`Cannot open the tag bus at ${url}: ${error.message}`)),
    );
  });
}

type Watch = {
  welcome: Promise<Welcome>;
  ended: Promise<BridgeError>;
  setListener(listener: (message: TagBusServerMessage) => void): void;
  fail(error: BridgeError, closeCode?: number): void;
};

// Routes the frames of the socket: the first one must be the welcome, the others go to the
// listener. A bad frame ends the bus with a protocol error.
function watchSocket(socket: WebSocket): Watch {
  let listener: (message: TagBusServerMessage) => void = () => undefined;
  let welcomed = false;
  const welcomeSignal = deferred<Welcome>();
  const endSignal = deferred<BridgeError>();
  const fail = (error: BridgeError, closeCode?: number): void => {
    endSignal.resolve(error);
    if (closeCode !== undefined && socket.readyState === WebSocket.OPEN) {
      socket.close(closeCode);
    }
  };
  const route = (message: TagBusServerMessage): void => {
    if (welcomed) {
      listener(message);
    } else if (message.type === "welcome") {
      welcomed = true;
      welcomeSignal.resolve(message);
    } else {
      throw new ProtocolError("The core answered the hello with something other than a welcome.");
    }
  };
  socket.on("message", (data, isBinary) => {
    try {
      const message = decodeFrame(data, isBinary);
      if (message !== "ignored") {
        route(message);
      }
    } catch (error) {
      const failure = error instanceof ProtocolError ? error : new ProtocolError(String(error));
      fail(failure, PROTOCOL_ERROR_CLOSE_CODE);
    }
  });
  socket.on("close", (code, reason) =>
    endSignal.resolve(closedError(code, reason.toString("utf8"))),
  );
  socket.on("error", (error) =>
    endSignal.resolve(new BusClosedError(`The tag bus failed: ${error.message}`)),
  );
  return {
    welcome: welcomeSignal.promise,
    ended: endSignal.promise,
    setListener: (next) => {
      listener = next;
    },
    fail,
  };
}

function senderOf(socket: WebSocket, watch: Watch): (message: TagBusClientMessage) => void {
  return (message) => {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      watch.fail(
        new BusClosedError(
          "The core stopped reading the tag bus: too many writes are waiting. Restart the bridge.",
        ),
        TAG_BUS_CLOSE_CODES.invalidMessage,
      );
      return;
    }
    socket.send(JSON.stringify(message));
  };
}

async function awaitWelcome(watch: Watch): Promise<Welcome> {
  const timer = setTimeout(
    () => watch.fail(new CoreUnavailableError("The core did not answer the hello.")),
    WELCOME_TIMEOUT_MILLISECONDS,
  );
  try {
    return await Promise.race([watch.welcome, watch.ended.then((error) => Promise.reject(error))]);
  } finally {
    clearTimeout(timer);
  }
}

function closeSocket(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    socket.once("close", () => resolve());
    socket.close();
  });
}

export async function openBus(url: string, mappingId: string): Promise<BusClient> {
  const socket = await openSocket(url);
  const watch = watchSocket(socket);
  const send = senderOf(socket, watch);
  send({
    type: "hello",
    version: TAG_BUS_VERSION,
    role: "plc",
    transport: OPCUA_CLIENT_KIND,
    mappingId,
  });
  let welcome: Welcome;
  try {
    welcome = await awaitWelcome(watch);
  } catch (error) {
    socket.terminate();
    throw error;
  }
  let nextWriteId = 1;
  return {
    welcome,
    subscribe: (tags) => send({ type: "subscribe", tags: [...tags] }),
    write: (tag, value) => send({ type: "write", id: `b${nextWriteId++}`, tag, value }),
    plcStatus: (module, status) =>
      send({
        type: "plc_status",
        module,
        connected: status.connected,
        reason: status.connected ? null : status.reason,
      }),
    onMessage: watch.setListener,
    ended: watch.ended,
    close: () => closeSocket(socket),
  };
}
