import type { ServerResponse } from "node:http";
import type { PoseStreamSink } from "./pose-stream-registry.ts";
import { pantinIdOf, type Route } from "./route-context.ts";

// Pose stream (ADR 0015): Server-Sent Events, one way, core to viewer.

function sinkOf(response: ServerResponse): PoseStreamSink {
  return {
    write: (text) => {
      // A client that does not read would make the core buffer without bound:
      // its snapshots are dropped until it drains.
      if (response.writableNeedDrain || response.destroyed) {
        return false;
      }
      response.write(text);
      return true;
    },
    end: () => response.end(),
  };
}

export const POSE_STREAM_ROUTES: readonly Route[] = [
  {
    method: "GET",
    pattern: ["pantins", ":pantinId", "pose", "stream"],
    handle: async (context) => {
      const { response } = context;
      // Unknown Pantin and full registry both throw here, before any header.
      const pantinId = pantinIdOf(context);
      const initial = await context.service.getPoseSnapshot(pantinId);
      if (response.destroyed) {
        return; // The viewer left while the Pantin loaded: no slot to take.
      }
      const stream = context.poseStreams.open(pantinId, sinkOf(response));
      response.on("close", stream.close);
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        // nginx would buffer the stream otherwise (ADR 0015 consequences).
        "x-accel-buffering": "no",
      });
      response.flushHeaders();
      stream.send(initial);
    },
  },
];
