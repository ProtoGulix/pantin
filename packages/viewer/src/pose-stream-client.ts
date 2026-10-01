import {
  CLOCK_STREAM_EVENT_NAME,
  POSE_STREAM_EVENT_NAME,
  type PoseSnapshot,
  PoseSnapshotSchema,
  type SimulationClockState,
  SimulationClockStateSchema,
} from "@pantin/protocol";
import { pantinUrl, type Schema } from "./api-transport.ts";

// Client of GET /api/pantins/:id/pose/stream (ADR 0015), which carries two
// events: `pose` and, since ADR 0032 point 9, `clock`. The browser's
// EventSource reconnects by itself after a network drop, so this module does
// not: it only opens, validates and closes. EventSource is injected so tests
// need no browser.

export interface PoseEventSource {
  readonly readyState: number;
  addEventListener(type: string, listener: (event: { data: unknown }) => void): void;
  // Assigned rather than added: it is the one callback EventSource guarantees.
  onerror: ((event: Event) => void) | null;
  close(): void;
}

export type PoseEventSourceFactory = (url: string) => PoseEventSource;

export interface PoseStreamCallbacks {
  onSnapshot(snapshot: PoseSnapshot): void;
  onClock(state: SimulationClockState): void;
  // An event that breaks the contract; detail is English, for the message line.
  onInvalid(detail: string): void;
  // The browser gave up (EventSource.CLOSED): it will not reconnect.
  onClosed(): void;
}

export interface PoseStreamClient {
  /** Follows the poses of this Pantin; null stops. A repeated id keeps the open stream. */
  follow(pantinId: string | null): void;
}

// EventSource.CLOSED, spelled out because the class may not exist in tests.
const EVENT_SOURCE_CLOSED = 2;

function parseEvent<Event>(data: unknown, schema: Schema<Event>, name: string): Event | string {
  let json: unknown;
  try {
    json = JSON.parse(String(data));
  } catch {
    return `The ${name} event is not valid JSON.`;
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? parsed.data : parsed.error.message;
}

export function createPoseStreamClient(
  factory: PoseEventSourceFactory,
  callbacks: PoseStreamCallbacks,
): PoseStreamClient {
  let source: PoseEventSource | null = null;
  let followedId: string | null = null;

  const stop = (): void => {
    source?.close();
    source = null;
    followedId = null;
  };

  const start = (pantinId: string): void => {
    const opened = factory(pantinUrl(pantinId, "/pose/stream"));
    source = opened;
    followedId = pantinId;
    // A late event of a stream already replaced must not reach the scene; an
    // event that breaks the contract is reported and never applied.
    const listen = <Event>(
      name: string,
      eventName: string,
      schema: Schema<Event>,
      deliver: (parsed: Event) => void,
    ): void => {
      opened.addEventListener(eventName, (event) => {
        if (source !== opened) {
          return;
        }
        const result = parseEvent(event.data, schema, name);
        if (typeof result === "string") {
          callbacks.onInvalid(result);
        } else {
          deliver(result);
        }
      });
    };
    listen("pose", POSE_STREAM_EVENT_NAME, PoseSnapshotSchema, callbacks.onSnapshot);
    listen("clock", CLOCK_STREAM_EVENT_NAME, SimulationClockStateSchema, callbacks.onClock);
    // EventSource retries by itself; CLOSED means it gave up, for instance
    // on a refused stream (all slots taken, ADR 0015). Forgetting the
    // followed id lets the next follow of the same Pantin try again.
    opened.onerror = () => {
      if (source === opened && opened.readyState === EVENT_SOURCE_CLOSED) {
        source = null;
        followedId = null;
        callbacks.onClosed();
      }
    };
  };

  return {
    follow: (pantinId) => {
      if (pantinId === followedId) {
        return;
      }
      stop();
      if (pantinId !== null) {
        start(pantinId);
      }
    },
  };
}
