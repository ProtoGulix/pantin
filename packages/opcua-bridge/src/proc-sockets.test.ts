import { describe, expect, it } from "vitest";
import { listeningInodes } from "./test-support/proc-sockets.ts";

const TABLE = `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 0100007F:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 11111 1 0000000000000000 100 0 0 10 0
   1: 0100007F:D2B2 0100007F:1F90 01 00000000:00000000 00:00000000 00000000  1000        0 22222 1 0000000000000000 20 4 30 10 -1
`;

describe("listeningInodes", () => {
  it("keeps the sockets in LISTEN state and no connected one", () => {
    expect(listeningInodes(TABLE)).toEqual(["11111"]);
  });
});
