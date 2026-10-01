// What a key does when it reaches the diagram's area and no handler of the
// diagram took it (the scroll host, a link's remove button, a menu item, a
// joint node). The window's Delete and F2 would act on the selection, which
// is not what the focus says (ADR 0030 point 4): inside the diagram they never
// get through.

export type UnhandledKey = "hint" | "swallow" | "pass";

interface KeyPressInDiagram {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  // A text field keeps its own Delete, as the window shortcuts let it.
  inEditableField: boolean;
}

export function unhandledKeyInDiagram(press: KeyPressInDiagram): UnhandledKey {
  if (press.inEditableField || press.ctrlKey || press.metaKey || press.altKey) {
    return "pass";
  }
  if (press.key === "Delete") {
    // Tell the user where an element is deleted rather than do nothing.
    return "hint";
  }
  return press.key === "F2" ? "swallow" : "pass";
}
