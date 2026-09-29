import {
  type CreateJointRequest,
  JOINT_COORDINATE_UNITS,
  JOINT_PARAMETERS,
  type JointType,
} from "@pantin/protocol";
import { describe, expect, it } from "vitest";
import { railBody, stepBody } from "../test-fixtures.ts";
import {
  buildJointRequest,
  formAxisChoice,
  initialJointForm,
  type JointFormState,
  parameterInputs,
  parseJointType,
  withJointFormType,
  withJointAxisDirection,
  withJointAxisReversed,
  withJointFormValue,
} from "./joint-form.ts";
import { JOINT_TYPES } from "./joint-labels.ts";

function limitsOf(request: CreateJointRequest): readonly [number, number] {
  if (!("limits" in request)) {
    throw new Error("Expected a request with limits.");
  }
  return request.limits;
}

const bodies = [railBody, stepBody("carriage", "N_1")];

function filled(type: JointType, values: Record<string, string>): JointFormState {
  const base = withJointFormType(initialJointForm(bodies), type);
  return { ...base, values: { ...base.values, name: "Joint", ...values } };
}

function typeWith(
  parameterKind: "coordinateRange" | "length",
  coordinateUnit?: "metre" | "radian",
): JointType {
  const found = JOINT_TYPES.find(
    (type) =>
      JOINT_PARAMETERS[type].some((parameter) => parameter.kind === parameterKind) &&
      (coordinateUnit === undefined || JOINT_COORDINATE_UNITS[type] === coordinateUnit),
  );
  if (found === undefined) {
    throw new Error(`No joint type declares a ${parameterKind}.`);
  }
  return found;
}

describe("initialJointForm", () => {
  it("starts with the first two bodies, the origin at zero and the axis along Z", () => {
    const form = initialJointForm(bodies);
    expect(form.values).toMatchObject({
      parent: "rail",
      child: "carriage",
      "origin.x": "0",
      "axis.x": "0",
      "axis.z": "1",
    });
  });

  it("reuses the only body for both ends", () => {
    expect(initialJointForm([railBody]).values).toMatchObject({ parent: "rail", child: "rail" });
  });
});

describe("form fields come from the protocol", () => {
  it("gives a range two inputs and a length one", () => {
    expect(parameterInputs({ field: "limits", kind: "coordinateRange" }).map((i) => i.id)).toEqual([
      "limits.lower",
      "limits.upper",
    ]);
    expect(parameterInputs({ field: "pitch", kind: "length" }).map((i) => i.id)).toEqual([
      "pitch.value",
    ]);
  });

  it("keeps shared values and drops parameters when the type changes", () => {
    const typed = withJointFormValue(filled(typeWith("coordinateRange"), {}), "limits.lower", "5");
    const changed = withJointFormType(typed, typeWith("length"));
    expect(changed.values["limits.lower"]).toBeUndefined();
    expect(changed.values.name).toBe("Joint");
  });

  it("accepts only known types", () => {
    expect(parseJointType(JOINT_TYPES[0] ?? "")).toBe(JOINT_TYPES[0]);
    expect(parseJointType("teleporter")).toBeNull();
  });
});

describe("buildJointRequest", () => {
  it("sends lengths in metres", () => {
    const result = buildJointRequest(
      filled(typeWith("coordinateRange", "metre"), {
        "origin.x": "10",
        "origin.z": "20",
        "limits.lower": "-5",
        "limits.upper": "100",
      }),
    );
    if (!result.ok) {
      throw new Error("Expected a valid request.");
    }
    expect(result.request.origin[0]).toBeCloseTo(0.01, 12);
    expect(result.request.origin[2]).toBeCloseTo(0.02, 12);
    expect(result.request.axis).toEqual([0, 0, 1]);
    const limits = limitsOf(result.request);
    expect(limits[0]).toBeCloseTo(-0.005, 12);
    expect(limits[1]).toBeCloseTo(0.1, 12);
  });

  it("sends the limits of a rotation in radians", () => {
    const result = buildJointRequest(
      filled(typeWith("coordinateRange", "radian"), {
        "limits.lower": "-90",
        "limits.upper": "180",
      }),
    );
    if (!result.ok) {
      throw new Error("Expected a valid request.");
    }
    const limits = limitsOf(result.request);
    expect(limits[0]).toBeCloseTo(-Math.PI / 2, 12);
    expect(limits[1]).toBeCloseTo(Math.PI, 12);
  });

  it("converts a length parameter from millimetres", () => {
    const type = typeWith("length");
    const result = buildJointRequest(
      filled(type, { "limits.lower": "0", "limits.upper": "50", "pitch.value": "2" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Reflect.get(result.request, "pitch")).toBeCloseTo(0.002);
    }
  });
});

describe("buildJointRequest input", () => {
  it("accepts a decimal comma", () => {
    const result = buildJointRequest(
      filled(typeWith("length"), {
        "origin.x": "1,5",
        "limits.lower": "0",
        "limits.upper": "1",
        "pitch.value": "2",
      }),
    );
    expect(result.ok && result.request.origin[0]).toBeCloseTo(0.0015);
  });

  it("builds a request for every joint type from its declared parameters alone", () => {
    for (const type of JOINT_TYPES) {
      const values = Object.fromEntries(
        JOINT_PARAMETERS[type].flatMap((parameter) =>
          parameterInputs(parameter).map((input) => [
            input.id,
            input.part === "upper" ? "10" : "1",
          ]),
        ),
      );
      expect(buildJointRequest(filled(type, values)), type).toMatchObject({ ok: true });
    }
  });
});

describe("buildJointRequest validation", () => {
  it("shows the schema's message for an empty name", () => {
    const result = buildJointRequest(filled(typeWith("length"), { name: " " }));
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.message).toContain("Name must not be empty.");
  });

  it("shows the schema's message for inverted limits", () => {
    const result = buildJointRequest(
      filled(typeWith("coordinateRange"), { "limits.lower": "10", "limits.upper": "1" }),
    );
    expect(!result.ok && result.message).toContain(
      "The lower limit must not exceed the upper one.",
    );
  });

  it("refuses a zero axis and a missing number", () => {
    const zeroAxis = buildJointRequest(filled(typeWith("length"), { "axis.z": "0" }));
    expect(!zeroAxis.ok && zeroAxis.message).toContain("The axis must not be the zero vector.");
    const empty = buildJointRequest(filled(typeWith("length"), { "pitch.value": "" }));
    expect(empty.ok).toBe(false);
  });
});

describe("axis choice", () => {
  const axisOf = (form: JointFormState) => [
    form.values["axis.x"],
    form.values["axis.y"],
    form.values["axis.z"],
  ];

  it("starts on +Z", () => {
    expect(formAxisChoice(initialJointForm(bodies))).toEqual({ direction: "z", reversed: false });
  });

  it("fills the components from X, Y or Z and keeps the sense", () => {
    const reversed = withJointAxisReversed(initialJointForm(bodies));
    const onX = withJointAxisDirection(reversed, "x");
    expect(axisOf(onX)).toEqual(["-1", "0", "0"]);
    expect(formAxisChoice(onX)).toEqual({ direction: "x", reversed: true });
  });

  it("reverses typed components and leaves unreadable text alone", () => {
    const typed = withJointFormValue(
      withJointFormValue(initialJointForm(bodies), "axis.x", "0,5"),
      "axis.y",
      "abc",
    );
    expect(axisOf(withJointAxisReversed(typed))).toEqual(["-0.5", "abc", "-1"]);
  });

  it("reveals the components on custom and hides them again on X, Y or Z", () => {
    const custom = withJointAxisDirection(initialJointForm(bodies), "custom");
    expect(formAxisChoice(custom).direction).toBe("custom");
    expect(axisOf(custom)).toEqual(["0", "0", "1"]);
    expect(withJointAxisDirection(custom, "y").customAxis).toBe(false);
  });

  it("shows an oblique or unreadable axis as custom", () => {
    const oblique = withJointFormValue(initialJointForm(bodies), "axis.x", "1");
    expect(formAxisChoice(oblique).direction).toBe("custom");
    const unreadable = withJointFormValue(initialJointForm(bodies), "axis.z", "");
    expect(formAxisChoice(unreadable).direction).toBe("custom");
  });
});
