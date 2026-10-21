import { z } from "zod";

// The reasons a module of a PLC link is lost (ADR 0045 point 11, ADR 0065 point 6): its
// connection closed, its watchdog expired, its nodes did not match the PLC's, or the PLC
// refused Pantin's certificate. The last two are OPC UA only. Shared by the tag bus
// (`plc_status`) and the console (`plc_disconnected`).
export const PlcModuleLossReasonSchema = z.enum([
  "closed",
  "timeout",
  "node_mismatch",
  "certificate_rejected",
]);
export type PlcModuleLossReason = z.infer<typeof PlcModuleLossReasonSchema>;
