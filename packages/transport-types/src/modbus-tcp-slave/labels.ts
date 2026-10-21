import type { TransportLabels } from "../schema-common.ts";
import type { IO_TYPES, IO_ZONES, WORD_ORDERS } from "./schema.ts";

// What the user reads; the setting and field names themselves stay in English (ADR 0064).
type ModbusSetting = "key" | "port" | "unitId" | "wordOrder" | "watchdogMilliseconds";
type ModbusField = "zone" | "address" | "ioType";
type ModbusValue =
  | (typeof IO_ZONES)[number]
  | (typeof IO_TYPES)[number]
  | (typeof WORD_ORDERS)[number];

export const MODBUS_TCP_SLAVE_LABELS = {
  en: {
    name: "Modbus TCP slave",
    settings: {
      key: "Key",
      port: "Port",
      unitId: "Unit id",
      wordOrder: "Word order",
      watchdogMilliseconds: "Watchdog (ms)",
    },
    channelFields: { zone: "Zone", address: "Address", ioType: "Type" },
    values: {
      coil: "Coil",
      discrete_input: "Discrete input",
      holding_register: "Holding register",
      input_register: "Input register",
      BOOL: "BOOL",
      REAL: "REAL",
      DINT: "DINT",
      low_word_first: "Low word first",
      high_word_first: "High word first",
    },
  },
  fr: {
    name: "Modbus TCP esclave",
    settings: {
      key: "Clé",
      port: "Port",
      unitId: "Adresse d'unité",
      wordOrder: "Ordre des mots",
      watchdogMilliseconds: "Chien de garde (ms)",
    },
    channelFields: { zone: "Zone", address: "Adresse", ioType: "Type" },
    values: {
      coil: "Bobine",
      discrete_input: "Entrée discrète",
      holding_register: "Registre de maintien",
      input_register: "Registre d'entrée",
      BOOL: "BOOL",
      REAL: "REAL",
      DINT: "DINT",
      low_word_first: "Mot faible en premier",
      high_word_first: "Mot fort en premier",
    },
  },
} satisfies Record<"en" | "fr", TransportLabels<ModbusSetting, ModbusField, ModbusValue>>;
