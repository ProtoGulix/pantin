import { attributeOf, type XmlElement } from "../xml-tree.ts";

// The TypeList of a CODESYS symbol configuration: every type a node can name.
// A structure or a function block is a container whose members are symbols of
// their own; everything else (simple types, enumerations, arrays, pointers,
// references) is a leaf that is never opened (ADR 0064 point 10, amendment of
// 2026-10-21).

interface ContainerMember {
  iecName: string;
  typeName: string;
  accessText: string | undefined;
  comment: string | null;
}

export type SymbolType =
  | { kind: "leaf"; iecType: string; aliasOf?: string }
  | { kind: "container"; iecType: string; members: ContainerMember[] };

const CONTAINER_POU_CLASSES: ReadonlySet<string> = new Set(["STRUCTURE", "FUNCTION_BLOCK"]);

/** The text of a Comment child: the leading space CODESYS writes is trimmed, newlines stay. */
export function commentOf(element: XmlElement): string | null {
  const comment = element.children.find((child) => child.name === "Comment");
  const text = comment?.text.trim() ?? "";
  return text === "" ? null : text;
}

// An enumeration lists its values as elements too, but they are values, not members.
function isContainer(element: XmlElement): boolean {
  return (
    element.name === "TypeUserDef" &&
    attributeOf(element, "typeclass") !== "Enum" &&
    CONTAINER_POU_CLASSES.has(attributeOf(element, "pouclass") ?? "")
  );
}

function membersOf(element: XmlElement): ContainerMember[] {
  return element.children.flatMap((child) => {
    const iecName = attributeOf(child, "iecname");
    const typeName = attributeOf(child, "type");
    if (child.name !== "UserDefElement" || iecName === undefined || typeName === undefined) {
      return [];
    }
    return [
      { iecName, typeName, accessText: attributeOf(child, "access"), comment: commentOf(child) },
    ];
  });
}

function typeOf(element: XmlElement, name: string): SymbolType {
  const iecType = attributeOf(element, "iecname") ?? name;
  if (isContainer(element)) {
    return { kind: "container", iecType, members: membersOf(element) };
  }
  const aliasOf = attributeOf(element, "aliasediecname");
  return aliasOf === undefined ? { kind: "leaf", iecType } : { kind: "leaf", iecType, aliasOf };
}

/**
 * The types by their file name (T_BOOL...). A derived function block already lists
 * the members it inherits (inherited_from), so its base type is never walked.
 */
export function readTypeList(typeList: XmlElement | undefined): Map<string, SymbolType> {
  const types = new Map<string, SymbolType>();
  for (const element of typeList?.children ?? []) {
    const name = attributeOf(element, "name");
    if (name !== undefined) {
      types.set(name, typeOf(element, name));
    }
  }
  return types;
}
