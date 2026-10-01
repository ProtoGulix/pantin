import {
  CLOCK_STREAM_EVENT_NAME,
  type PantinId,
  POSE_STREAM_EVENT_NAME,
  type PoseSnapshot,
  type SimulationClockState,
} from "@pantin/protocol";
import {
  hasMoved,
  isSnapshotPeriodElapsed,
  SNAPSHOT_PERIOD_SECONDS,
  shouldSendSnapshot,
} from "../domain/pose-stream.ts";
import { ApiError } from "../errors.ts";
import type { SimulationTimer } from "../service/simulation-loop.ts";

// The open pose streams of one core (ADR 0015): who is connected, what each
// one last received, and their keep-alive timers. Writing to the socket is
// behind `PoseStreamSink`, so the logic runs without HTTP.

export const MAX_POSE_STREAMS = 16;
const KEEP_ALIVE_SECONDS = 15;
const CLOCK_EVENT_SECONDS = 1;

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
  clock(pantinId: PantinId): SimulationClockState | undefined;
  // Cheap: read after every tick, where `clock` builds a whole state.
  isRunning(pantinId: PantinId): boolean | undefined;
};

type PoseStream = {
  send(snapshot: PoseSnapshot): void;
  sendClock(): void;
  close(): void;
};

export type PoseStreamRegistry = {
  // Throws `conflict` when all slots are taken. Nothing is written yet.
  open(pantinId: PantinId, sink: PoseStreamSink): PoseStream;
  // To call after every simulation tick.
  notifyTick(): void;
  // To call after the clock of a Pantin was changed by a request (ADR 0032
  // point 9): sends its clock state, and its poses when `withPose` (a step
  // request moves them while no tick sends anything).
  notifyClockChange(pantinId: PantinId, change: { withPose: boolean }): void;
  openCount(): number;
  closeAll(): void;
};

type StreamState = {
  pantinId: PantinId;
  sink: PoseStreamSink;
  lastSent: PoseSnapshot | undefined;
  // Wall time of the last pose written, for the paused cadence.
  lastSentAt: number;
  stopTimers: () => void;
};

function sendTo(state: StreamState, snapshot: PoseSnapshot, now: number): void {
  if (state.sink.write(encodeEvent(POSE_STREAM_EVENT_NAME, snapshot))) {
    state.lastSent = snapshot;
    state.lastSentAt = now;
  }
}

function encodeEvent(name: string, data: PoseSnapshot | SimulationClockState): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sendClockTo(source: PoseSource, state: StreamState): void {
  const clock = source.clock(state.pantinId);
  if (clock !== undefined) {
    state.sink.write(encodeEvent(CLOCK_STREAM_EVENT_NAME, clock));
  }
}

function sendCurrentPose(source: PoseSource, state: StreamState, now: number): void {
  const current = source.snapshot(state.pantinId);
  if (current !== undefined) {
    sendTo(state, current, now);
  }
}

// Running: the period counts simulated time, so the decision does not depend
// on wall-clock jitter (ADR 0015 point 3).
function notifyRunningStream(source: PoseSource, state: StreamState, now: number): void {
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
    sendTo(state, current, now);
  }
}

// Paused: simulated time stands still, so the period counts wall time and
// only motion (an edit of a joint position) is worth a send (ADR 0032 point 9).
function notifyPausedStream(source: PoseSource, state: StreamState, now: number): void {
  const { lastSent } = state;
  if (lastSent !== undefined && now - state.lastSentAt < SNAPSHOT_PERIOD_SECONDS) {
    return;
  }
  const current = source.snapshot(state.pantinId);
  if (current !== undefined && (lastSent === undefined || hasMoved(lastSent, current))) {
    sendTo(state, current, now);
  }
}

function notifyStream(source: PoseSource, state: StreamState, now: number): void {
  if (source.isRunning(state.pantinId) === false) {
    notifyPausedStream(source, state, now);
  } else {
    notifyRunningStream(source, state, now);
  }
}

type RegistryContext = { source: PoseSource; timer: SimulationTimer };

function newStreamState(
  { source, timer }: RegistryContext,
  pantinId: PantinId,
  sink: PoseStreamSink,
): StreamState {
  const state: StreamState = {
    pantinId,
    sink,
    lastSent: undefined,
    lastSentAt: timer.now(),
    stopTimers: noop,
  };
  const stopKeepAlive = timer.repeat(KEEP_ALIVE_SECONDS, () => {
    sink.write(": keep-alive\n\n");
  });
  // An idle machine sends no pose: without this the viewer's time would freeze.
  const stopClock = timer.repeat(CLOCK_EVENT_SECONDS, () => {
    if (source.isRunning(pantinId) === true) {
      sendClockTo(source, state);
    }
  });
  state.stopTimers = () => {
    stopKeepAlive();
    stopClock();
  };
  return state;
}

export function createPoseStreamRegistry(options: {
  source: PoseSource;
  // Wall time for the paused cadence, and the repeating keep-alive and clock timers.
  timer: SimulationTimer;
  maxStreams?: number;
}): PoseStreamRegistry {
  const { source, timer } = options;
  const maxStreams = options.maxStreams ?? MAX_POSE_STREAMS;
  const streams = new Set<StreamState>();
  const release = (state: StreamState) => {
    state.stopTimers();
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
      const state = newStreamState(options, pantinId, sink);
      streams.add(state);
      return {
        send: (snapshot) => sendTo(state, snapshot, timer.now()),
        sendClock: () => sendClockTo(source, state),
        close: () => release(state),
      };
    },
    notifyTick: () => {
      const now = timer.now();
      for (const state of [...streams]) {
        notifyStream(source, state, now);
      }
    },
    notifyClockChange: (pantinId, { withPose }) => {
      const now = timer.now();
      for (const state of [...streams]) {
        if (state.pantinId === pantinId) {
          sendClockTo(source, state);
          if (withPose) {
            sendCurrentPose(source, state, now);
          }
        }
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
