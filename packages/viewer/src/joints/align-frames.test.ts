import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/translate.ts";
import { pantinResponse, railBody, slideJoint, weldJoint } from "../test-fixtures.ts";
import { alignFramesButtonOf, alignFramesMessage } from "./align-frames.ts";
import { jointFormFor } from "./joint-edit-form.ts";
import { initialJointForm, withJointFormType, withJointFormValue } from "./joint-form.ts";

const t = createTranslator("en");
const joints = [slideJoint, weldJoint];

describe("alignFramesButtonOf", () => {
  it("is offered, enabled, on a saved joint that moves and is unchanged", () => {
    const view = alignFramesButtonOf(jointFormFor(slideJoint), joints, t, false);
    expect(view).toMatchObject({ label: "Align the frame on this axis", disabled: false });
    expect(view?.tooltip).toContain("[0, 0, 1]");
  });

  it("is hidden on a fixed joint and on a new joint", () => {
    expect(alignFramesButtonOf(jointFormFor(weldJoint), joints, t, false)).toBeNull();
    expect(alignFramesButtonOf(initialJointForm([]), joints, t, false)).toBeNull();
  });

  it("is disabled, with the reason, while the form has unsaved changes", () => {
    const edited = withJointFormValue(jointFormFor(slideJoint), "axis.y", "1");
    const view = alignFramesButtonOf(edited, joints, t, false);
    expect(view?.disabled).toBe(true);
    expect(view?.tooltip).toMatch(/Apply the joint's changes first/);
    const retyped = withJointFormType(jointFormFor(slideJoint), "revolute");
    expect(alignFramesButtonOf(retyped, joints, t, false)?.disabled).toBe(true);
  });

  it("is disabled while a request runs", () => {
    expect(alignFramesButtonOf(jointFormFor(slideJoint), joints, t, true)?.disabled).toBe(true);
  });
});

describe("alignFramesMessage", () => {
  const pantin = pantinResponse(false, [railBody]);
  const answer = { pantin, reframedAssemblies: [], rewrittenJoints: [] };

  it("says the frames were already aligned when nothing was reframed", () => {
    expect(alignFramesMessage(answer, "en").key).toBe("message.framesAlreadyAligned");
  });

  it("names the assemblies by display name and lists the rewritten joints", () => {
    const first = pantin.document.assemblies[0];
    const message = alignFramesMessage(
      {
        ...answer,
        reframedAssemblies: [first?.key ?? "", "unknown_key"],
        rewrittenJoints: [{ id: "slide", name: "Slide" }],
      },
      "en",
    );
    const text = t(message.key, message.parameters);
    expect(text).toContain(first?.name ?? "missing");
    expect(text).toContain("unknown_key");
    expect(text).toMatch(/^Frames aligned on the axis/);
    expect(text).toContain("Joints rewritten: Slide.");
  });
});
