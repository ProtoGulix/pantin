import type { DriveTypeLabels } from "../schema-common.ts";
import type {
  VALVE_DOUBLE_3_2_PARAMETERS,
  VALVE_DOUBLE_3_2_PORTS,
  VALVE_DOUBLE_3_2_TAGS,
} from "./schema.ts";

// What the user reads; the tag members and port names themselves stay in English (ADR 0022).
export const VALVE_DOUBLE_3_2_LABELS = {
  en: {
    name: "Double valve 3/2",
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
    name: "Double distributeur 3/2",
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
  (typeof VALVE_DOUBLE_3_2_PARAMETERS)[number]["field"],
  (typeof VALVE_DOUBLE_3_2_TAGS)[number]["member"],
  (typeof VALVE_DOUBLE_3_2_PORTS)[number]["name"]
>;
