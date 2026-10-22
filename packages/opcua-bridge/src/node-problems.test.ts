import { describe, expect, it } from "vitest";
import type { NodeSignal } from "./module-plan.ts";
import { describeNamespaceArray, nodeProblems, unknownNamespaceProblem } from "./node-problems.ts";

const command: NodeSignal = {
  tag: "press.valve.extend",
  direction: "command",
  identifier: "s=|var|App.x",
  iecType: "DINT",
};
const feedback: NodeSignal = { ...command, tag: "press.cylinder.pos", direction: "feedback" };

describe("nodeProblems", () => {
  it("accepts a node of the right type with the access the direction needs", () => {
    expect(nodeProblems(command, { dataType: "Int32", userAccessLevel: 1 })).toEqual([]);
    expect(nodeProblems(feedback, { dataType: "Int32", userAccessLevel: 3 })).toEqual([]);
  });

  it("names the found type and the expected one", () => {
    const [problem] = nodeProblems(command, { dataType: "Int16", userAccessLevel: 3 });
    expect(problem).toContain("holds Int16 but its channel says DINT, which is Int32");
  });

  it("says another type when the bridge does not carry the node's", () => {
    const [problem] = nodeProblems(command, { dataType: "other", userAccessLevel: 3 });
    expect(problem).toContain("holds another type");
  });

  it("needs read for a command and write for a feedback", () => {
    expect(nodeProblems(command, { dataType: "Int32", userAccessLevel: 2 })).toHaveLength(1);
    expect(nodeProblems(feedback, { dataType: "Int32", userAccessLevel: 1 })).toHaveLength(1);
  });

  it("reports a missing node alone", () => {
    expect(nodeProblems(command, { dataType: null, userAccessLevel: 0 })).toEqual([
      expect.stringContaining("does not exist"),
    ]);
  });

  it("reports the type and the access as two problems", () => {
    expect(nodeProblems(feedback, { dataType: "Int16", userAccessLevel: 1 })).toHaveLength(2);
  });
});

describe("the namespace problem", () => {
  it("lists the server's table with indexes, so that a URI can be copied", () => {
    const table = ["http://opcfoundation.org/UA/", "urn:codesys:plc"];
    expect(describeNamespaceArray(table)).toBe(
      "[0] http://opcfoundation.org/UA/, [1] urn:codesys:plc",
    );
    expect(unknownNamespaceProblem("urn:wrong", table)).toContain('no namespace "urn:wrong"');
  });
});
