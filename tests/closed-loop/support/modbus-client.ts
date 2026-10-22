import { connect, type Socket } from "node:net";

// A Modbus TCP client for the test: just enough of the protocol to read what the bridge's
// slave serves. It is written here so that the test needs no Modbus library; the bridge's own
// conformance is tested against pymodbus in packages/bridge.

const READ_DISCRETE_INPUTS = 2;
const READ_INPUT_REGISTERS = 4;
const HEADER_BYTES = 7;
const EXCEPTION_FLAG = 0x80;
const REQUEST_TIMEOUT_MILLISECONDS = 5_000;

export type ModbusClient = {
  readDiscreteInputs(address: number, count: number): Promise<boolean[]>;
  readInputRegisters(address: number, count: number): Promise<number[]>;
  close(): void;
};

type Pending = { resolve: (pdu: Buffer) => void; reject: (error: Error) => void };

function unpackBits(data: Buffer, count: number): boolean[] {
  return Array.from({ length: count }, (_, index) => {
    const byte = data[Math.floor(index / 8)] ?? 0;
    return ((byte >> (index % 8)) & 1) === 1;
  });
}

function unpackRegisters(data: Buffer, count: number): number[] {
  return Array.from({ length: count }, (_, index) => data.readUInt16BE(index * 2));
}

/** A little-endian word pair, the "low word first" order of the module, read as a REAL. */
export function realOfLowWordFirst(registers: readonly number[]): number {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt16BE(registers[1] ?? 0, 0);
  bytes.writeUInt16BE(registers[0] ?? 0, 2);
  return bytes.readFloatBE(0);
}

/** Cuts the byte stream into MBAP frames: answers `[transaction, pdu]` as they complete. */
function createFrameReader(onFrame: (transaction: number, pdu: Buffer) => void) {
  let received = Buffer.alloc(0);
  return (chunk: Buffer): void => {
    received = Buffer.concat([received, chunk]);
    while (received.length >= HEADER_BYTES) {
      const frameLength = 6 + received.readUInt16BE(4);
      if (received.length < frameLength) {
        return;
      }
      onFrame(received.readUInt16BE(0), received.subarray(HEADER_BYTES, frameLength));
      received = received.subarray(frameLength);
    }
  };
}

function openSocket(host: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const opened = connect({ host, port }, () => resolve(opened));
    opened.once("error", reject);
  });
}

function frameOf(unitId: number, transaction: number, functionCode: number, range: number[]) {
  const frame = Buffer.alloc(12);
  frame.writeUInt16BE(transaction, 0);
  frame.writeUInt16BE(6, 4);
  frame.writeUInt8(unitId, 6);
  frame.writeUInt8(functionCode, 7);
  frame.writeUInt16BE(range[0] ?? 0, 8);
  frame.writeUInt16BE(range[1] ?? 0, 10);
  return frame;
}

export async function connectModbusClient(
  host: string,
  port: number,
  unitId: number,
): Promise<ModbusClient> {
  const socket = await openSocket(host, port);
  const pending = new Map<number, Pending>();
  let nextTransaction = 1;
  let closure: Error | undefined;

  const settleAll = (error: Error): void => {
    for (const request of pending.values()) {
      request.reject(error);
    }
    pending.clear();
  };
  socket.on("error", settleAll);
  socket.on("close", () => {
    closure = new Error(
      "The Modbus connection closed. The bridge drops a master that stays silent longer than " +
        "three watchdog times (at least 5 s), so keep polling or reconnect.",
    );
    settleAll(closure);
  });
  socket.on(
    "data",
    createFrameReader((transaction, pdu) => {
      pending.get(transaction)?.resolve(pdu);
      pending.delete(transaction);
    }),
  );

  // Function code, byte count, data; or function code with the exception flag, then the code.
  const read = async (functionCode: number, address: number, count: number): Promise<Buffer> => {
    // A socket reset while idle is already destroyed: writing to it raises no error event, so
    // without this check the request would wait for ever.
    if (closure !== undefined) {
      throw closure;
    }
    const transaction = nextTransaction++ % 0x10000;
    const answer = new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(transaction);
        reject(new Error(`No Modbus answer within ${REQUEST_TIMEOUT_MILLISECONDS} ms.`));
      }, REQUEST_TIMEOUT_MILLISECONDS);
      pending.set(transaction, {
        resolve: (answered) => {
          clearTimeout(timer);
          resolve(answered);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
    socket.write(frameOf(unitId, transaction, functionCode, [address, count]));
    const pdu = await answer;
    if ((pdu[0] ?? 0) & EXCEPTION_FLAG) {
      throw new Error(`Modbus exception ${pdu[1]} for function ${functionCode}.`);
    }
    return pdu.subarray(2);
  };

  return {
    readDiscreteInputs: async (address, count) =>
      unpackBits(await read(READ_DISCRETE_INPUTS, address, count), count),
    readInputRegisters: async (address, count) =>
      unpackRegisters(await read(READ_INPUT_REGISTERS, address, count), count),
    close: () => socket.destroy(),
  };
}
