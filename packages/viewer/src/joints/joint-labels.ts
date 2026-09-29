import {
  type CreateJointRequest,
  CreateJointRequestSchema,
  type JointType,
} from "@pantin/protocol";
import { isMessageKey, type MessageKey } from "../i18n/translate.ts";

// Labels of joint types and of their parameter fields (ADR 0016). The message
// keys are built from the protocol's own unions: adding a joint type, or a
// field to a type, makes the template types below stop matching the catalogue
// until fr.json has the label. The compiler is what asks for it.

// Every field name of every joint type, minus those all types share (shown by
// dedicated rows of the form and of the properties).
type AllFields<Request> = Request extends unknown ? keyof Request : never;
type SharedField = "type" | "name" | "parent" | "child" | "origin" | "axis";
type ParameterField = Exclude<AllFields<CreateJointRequest>, SharedField>;

// The types in the order the protocol lists them.
export const JOINT_TYPES: readonly JointType[] = CreateJointRequestSchema.options.map(
  (option) => option.shape.type.value,
);

export function jointTypeLabelKey(type: JointType): MessageKey {
  return `joint.type.${type}`;
}

// The constraint is the compile-time check: every declared field of every
// type must have its catalogue key.
type CataloguedKey<Key extends MessageKey> = Key;
type ParameterLabelKey = CataloguedKey<`joint.parameter.${ParameterField}`>;

function isParameterLabelKey(key: string): key is ParameterLabelKey {
  return isMessageKey(key);
}

/**
 * The protocol declares parameter fields as plain strings, so the lookup is
 * checked at run time as well (a test covers every declared field); an
 * unknown field is a bug in the catalogue, reported loudly.
 */
export function parameterLabelKey(field: string): MessageKey {
  const key = `joint.parameter.${field}`;
  if (!isParameterLabelKey(key)) {
    throw new Error(`No label for joint parameter "${field}": add ${key} to the catalogues.`);
  }
  return key;
}
