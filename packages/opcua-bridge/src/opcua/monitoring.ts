import type { OpcuaIecType } from "@pantin/protocol";
import {
  AttributeIds,
  ClientMonitoredItemGroup,
  type ClientSession,
  ClientSubscription,
  TimestampsToReturn,
} from "node-opcua-client";
import { keepAliveCountFor, lifetimeCountFor } from "../subscription-timing.ts";
import { fromVariant } from "./variants.ts";

// The subscription of one module (ADR 0065 points 2 and 6): its command nodes, sampled and
// queued as io.json says, and a hook on every publish response, which is what the watchdog
// listens to.

// ADR 0065 point 2: a queue of 10 so that a burst of changes arrives in order.
const QUEUE_SIZE = 10;

export type MonitoredCommand = { tag: string; nodeId: string; iecType: OpcuaIecType };

export type MonitoringSettings = {
  samplingMilliseconds: number;
  publishingMilliseconds: number;
  watchdogMilliseconds: number;
};

export type MonitoringHooks = {
  /** Every publish response, data or keep-alive. */
  onPublish(): void;
  /** A command node reported a value, in the order the PLC produced them. */
  onCommandValue(tag: string, value: number): void;
};

function started(subscription: ClientSubscription): Promise<void> {
  return new Promise((resolve, reject) => {
    subscription.once("started", () => resolve());
    subscription.once("error", reject);
  });
}

async function createSubscription(
  session: ClientSession,
  settings: MonitoringSettings,
): Promise<ClientSubscription> {
  const keepAlive = keepAliveCountFor(
    settings.watchdogMilliseconds,
    settings.publishingMilliseconds,
  );
  const subscription = ClientSubscription.create(session, {
    requestedPublishingInterval: settings.publishingMilliseconds,
    requestedMaxKeepAliveCount: keepAlive,
    requestedLifetimeCount: lifetimeCountFor(keepAlive),
    publishingEnabled: true,
  });
  await started(subscription);
  // The server may have lengthened the interval, which would make the keep-alive too rare for
  // the watchdog: size the counts again with the revised interval (point 6).
  const revisedKeepAlive = keepAliveCountFor(
    settings.watchdogMilliseconds,
    subscription.publishingInterval,
  );
  if (revisedKeepAlive !== subscription.maxKeepAliveCount) {
    await subscription.modify({
      requestedPublishingInterval: subscription.publishingInterval,
      requestedMaxKeepAliveCount: revisedKeepAlive,
      requestedLifetimeCount: lifetimeCountFor(revisedKeepAlive),
      maxNotificationsPerPublish: 0,
      priority: 1,
    });
  }
  return subscription;
}

export type RefusedCommand = { command: MonitoredCommand; status: string };

// Resolves once the server answered the creation of the items, which it can do item by item.
function created(group: ClientMonitoredItemGroup): Promise<void> {
  return new Promise((resolve, reject) => {
    group.once("initialized", () => resolve());
    group.once("terminated", (error: Error) => reject(error));
  });
}

async function watchCommands(
  subscription: ClientSubscription,
  commands: readonly MonitoredCommand[],
  samplingMilliseconds: number,
  hooks: MonitoringHooks,
): Promise<RefusedCommand[]> {
  if (commands.length === 0) {
    return [];
  }
  const group = ClientMonitoredItemGroup.create(
    subscription,
    commands.map(({ nodeId }) => ({ nodeId, attributeId: AttributeIds.Value })),
    { samplingInterval: samplingMilliseconds, queueSize: QUEUE_SIZE, discardOldest: true },
    TimestampsToReturn.Neither,
  );
  group.on("changed", (_item, dataValue, index) => {
    const command = commands[index];
    const value = fromVariant(dataValue.value);
    if (command !== undefined && value !== undefined && dataValue.statusCode.isGood()) {
      hooks.onCommandValue(command.tag, value);
    }
  });
  await created(group);
  return commands.flatMap((command, index) => {
    const status = group.monitoredItems[index]?.statusCode;
    return status === undefined || status.isGood() ? [] : [{ command, status: status.toString() }];
  });
}

/**
 * Creates the subscription and its items; rejects if the server refuses the subscription or the
 * whole creation. Returns the items the server refused one by one: the caller must not call the
 * module connected then (ADR 0065 point 6). Closing the session deletes the subscription, so
 * there is nothing to terminate separately.
 */
export async function startMonitoring(
  session: ClientSession,
  commands: readonly MonitoredCommand[],
  settings: MonitoringSettings,
  hooks: MonitoringHooks,
): Promise<RefusedCommand[]> {
  const subscription = await createSubscription(session, settings);
  subscription.on("raw_notification", hooks.onPublish);
  return watchCommands(subscription, commands, settings.samplingMilliseconds, hooks);
}
