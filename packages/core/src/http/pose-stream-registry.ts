import { type PantinId, POSE_STREAM_EVENT_NAME, type PoseSnapshot } from "@pantin/protocol";
import { isSnapshotPeriodElapsed, shouldSendSnapshot } from "../domain/pose-stream.ts";
import { ApiError } from "../errors.ts";
import type { SimulationTimer } from "../service/simulation-loop.ts";

// The open pose streams of one core (ADR 0015): who is connected, what each
// one last received, and their keep-alive timers. Writing to the socket is
// behind `PoseStreamSink`, so the logic runs without HTTP.

export const MAX_POSE_STREAMS = 16;
const KEEP_ALIVE_SECONDS = 15;

export type PoseStreamSink = {
  // Returns false when nothing was written (client too slow): the caller then
  // does not count the snapshot as sent.
  write(text: string): boolean;
  end(): void;
};

// Sync access to loaded Pantins: the tick callback cannot wait for a load.
export type PoseSource = {
  stepCount(pantinId: PantinId): number | undefined;
  snapshot(pantinId: PantinId): PoseSnapshot | undefined;
};

type PoseStream = {
  send(snapshot: PoseSnapshot): void;
  close(): void;
};

export type PoseStreamRegistry = {
  // Throws `conflict` when all slots are taken. Nothing is written yet.
  open(pantinId: PantinId, sink: PoseStreamSink): PoseStream;
  // To call after every simulation tick.
  notifyTick(): void;
  openCount(): number;
  closeAll(): void;
};

type StreamState = {
  pantinId: PantinId;
  sink: PoseStreamSink;
  lastSent: PoseSnapshot | undefined;
  stopKeepAlive: () => void;
};

function encodeSnapshotEvent(snapshot: PoseSnapshot): string {
  return `event: ${POSE_STREAM_EVENT_NAME}\ndata: ${JSON.stringify(snapshot)}\n\n`;
}

function sendTo(state: StreamState, snapshot: PoseSnapshot): void {
  if (state.sink.write(encodeSnapshotEvent(snapshot))) {
    state.lastSent = snapshot;
  }
}

function notifyStream(source: PoseSource, state: StreamState): void {
  const stepCount = source.stepCount(state.pantinId);
  const { lastSent } = state;
  if (stepCount === undefined) {
    return;
  }
  // Cheap check first: the pose is only computed when the period elapsed.
  if (lastSent !== undefined && !isSnapshotPeriodElapsed(lastSent.stepCount, stepCount)) {
    return;
  }
  const current = source.snapshot(state.pantinId);
  if (current !== undefined && (lastSent === undefined || shouldSendSnapshot(lastSent, current))) {
    sendTo(state, current);
  }
}

export function createPoseStreamRegistry(options: {
  source: PoseSource;
  keepAliveTimer: SimulationTimer;
  maxStreams?: number;
}): PoseStreamRegistry {
  const maxStreams = options.maxStreams ?? MAX_POSE_STREAMS;
  const streams = new Set<StreamState>();
  const release = (state: StreamState) => {
    state.stopKeepAlive();
    streams.delete(state);
  };
  return {
    open(pantinId, sink) {
      if (streams.size >= maxStreams) {
        throw new ApiError(
          "conflict",
          `The core already serves ${maxStreams} pose streams. Close a viewer tab and retry.`,
        );
      }
      const state: StreamState = { pantinId, sink, lastSent: undefined, stopKeepAlive: noop };
      state.stopKeepAlive = options.keepAliveTimer.repeat(KEEP_ALIVE_SECONDS, () => {
        sink.write(": keep-alive\n\n");
      });
      streams.add(state);
      return { send: (snapshot) => sendTo(state, snapshot), close: () => release(state) };
    },
    notifyTick: () => {
      for (const state of [...streams]) {
        notifyStream(options.source, state);
      }
    },
    openCount: () => streams.size,
    closeAll: () => {
      for (const state of [...streams]) {
        release(state);
        state.sink.end();
      }
    },
  };
}

function noop(): void {}
