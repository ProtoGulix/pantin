import type { DriveTypeLabels } from "../schema-common.ts";
import type {
  VALVE_3_2_SINGLE_PARAMETERS,
  VALVE_3_2_SINGLE_PORTS,
  VALVE_3_2_SINGLE_TAGS,
} from "./schema.ts";

// What the user reads; the tag members and port names themselves stay in English (ADR 0022).
export const VALVE_3_2_SINGLE_LABELS = {
  en: {
    name: "Valve 3/2, single solenoid",
    parameters: {},
    tags: {
      coil_12: "Coil 12",
    },
    ports: {
      port_2: "Port 2",
    },
  },
  fr: {
    name: "Distributeur 3/2, monostable",
    parameters: {},
    tags: {
      coil_12: "Bobine 12",
    },
    ports: {
      port_2: "Orifice 2",
    },
  },
} satisfies DriveTypeLabels<
  (typeof VALVE_3_2_SINGLE_PARAMETERS)[number]["field"],
  (typeof VALVE_3_2_SINGLE_TAGS)[number]["member"],
  (typeof VALVE_3_2_SINGLE_PORTS)[number]["name"]
>;
