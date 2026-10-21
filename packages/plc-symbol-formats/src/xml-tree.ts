import { z } from "zod";

// The tree the XML subset reader builds (ADR 0064 point 11). Mixed content is
// flattened on purpose: the formats Pantin reads put either text or elements in
// an element, never both, so an element keeps its child elements in order and
// its text (text and CDATA joined) apart.

export interface XmlAttribute {
  name: string;
  value: string;
}

export interface XmlElement {
  name: string;
  // A list rather than a record: an attribute named "__proto__" is only data.
  attributes: XmlAttribute[];
  children: XmlElement[];
  text: string;
}

// The reader builds the tree itself; the check is the Zod gate of CLAUDE.md 8,
// so a format never reads a tree that is not of this shape.
export const XmlElementSchema: z.ZodType<XmlElement> = z.lazy(() =>
  z.strictObject({
    name: z.string().min(1),
    attributes: z.array(z.strictObject({ name: z.string().min(1), value: z.string() })),
    children: z.array(XmlElementSchema),
    text: z.string(),
  }),
);

export function attributeOf(element: XmlElement, name: string): string | undefined {
  return element.attributes.find((attribute) => attribute.name === name)?.value;
}

export function childrenNamed(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((child) => child.name === name);
}

export function firstChildNamed(element: XmlElement, name: string): XmlElement | undefined {
  return element.children.find((child) => child.name === name);
}
