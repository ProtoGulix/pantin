import type { DriveTypeLabels } from "../schema-common.ts";
import type {
  VALVE_5_2_DOUBLE_PARAMETERS,
  VALVE_5_2_DOUBLE_PORTS,
  VALVE_5_2_DOUBLE_TAGS,
} from "./schema.ts";

// What the user reads; the tag members and port names themselves stay in English (ADR 0022).
export const VALVE_5_2_DOUBLE_LABELS = {
  en: {
    name: "Valve 5/2, double solenoid",
    parameters: {},
    tags: {
      coil_14: "Coil 14",
      coil_12: "Coil 12",
    },
    ports: {
      port_2: "Port 2",
      port_4: "Port 4",
    },
  },
  fr: {
    name: "Distributeur 5/2, bistable",
    parameters: {},
    tags: {
      coil_14: "Bobine 14",
      coil_12: "Bobine 12",
    },
    ports: {
      port_2: "Orifice 2",
      port_4: "Orifice 4",
    },
  },
} satisfies DriveTypeLabels<
  (typeof VALVE_5_2_DOUBLE_PARAMETERS)[number]["field"],
  (typeof VALVE_5_2_DOUBLE_TAGS)[number]["member"],
  (typeof VALVE_5_2_DOUBLE_PORTS)[number]["name"]
>;
