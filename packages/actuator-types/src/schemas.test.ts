import type { PortDomain } from "@pantin/drive-types/ports";
import { DRIVE_PORTS } from "@pantin/drive-types/schemas";
import { describe, expect, it } from "vitest";
import { ACTUATOR_DEFAULT_FEEDS, ACTUATOR_INPUT_PORTS, ActuatorFieldsSchema } from "./schemas.ts";

// Read from the schema union, so a new type is covered without editing the test.
const actuatorTypes = ActuatorFieldsSchema.options.map((option) => option.shape.type.value);

// Every output port name of the drive types, with the domains it carries.
function outputDomains(name: string): Set<PortDomain> {
  const domains = new Set<PortDomain>();
  for (const ports of Object.values(DRIVE_PORTS)) {
    for (const port of ports) {
      if (port.name === name) {
        domains.add(port.domain);
      }
    }
  }
  return domains;
}

describe("default feeds", () => {
  it.each(actuatorTypes)("%s names only its own input ports", (type) => {
    const inputNames = ACTUATOR_INPUT_PORTS[type].map((port) => port.name).sort();
    expect(Object.keys(ACTUATOR_DEFAULT_FEEDS[type]).sort()).toEqual(inputNames);
  });

  it.each(actuatorTypes)("%s names output ports of the right domain", (type) => {
    for (const input of ACTUATOR_INPUT_PORTS[type]) {
      const candidates = ACTUATOR_DEFAULT_FEEDS[type][input.name] ?? [];
      expect(candidates.length).toBeGreaterThan(0);
      for (const name of candidates) {
        // Some drive type offers that port name in the domain this input reads.
        expect(outputDomains(name).has(input.domain), `${type}.${input.name} ← ${name}`).toBe(true);
      }
    }
  });
});

describe("fields schema", () => {
  it("accepts each type and rejects a non-positive speed", () => {
    expect(ActuatorFieldsSchema.safeParse({ type: "servo_motor" }).success).toBe(true);
    expect(ActuatorFieldsSchema.safeParse({ type: "ac_motor", nominalSpeed: 2 }).success).toBe(
      true,
    );
    expect(ActuatorFieldsSchema.safeParse({ type: "ac_motor", nominalSpeed: 0 }).success).toBe(
      false,
    );
    expect(
      ActuatorFieldsSchema.safeParse({
        type: "single_acting_cylinder",
        extendSpeed: 1,
        returnSpeed: -1,
      }).success,
    ).toBe(false);
  });
});
