import { isDeviceKind } from "../device-selection.ts";
import { gizmoItem, item, type MenuDefinition } from "./menu-definitions.ts";

// The Édition menu as data (see menu-model.ts for the menu bar).

export const EDIT_MENU: MenuDefinition = {
  id: "edit",
  labelKey: "menubar.edit",
  entries: [
    item(
      "newJoint",
      "menubar.edit.newJoint",
      (context) => context.editing && context.hasBodies && !context.busy,
    ),
    // ADR 0055 point 12: on the selected body and group rows of one assembly.
    item("group", "menubar.edit.group", (context) => context.canGroup && !context.busy),
    item("ungroup", "menubar.edit.ungroup", (context) => context.canUngroup && !context.busy),
    // ADR 0060: acts on the whole Pantin, not on the selection.
    item(
      "deleteRedundantJoints",
      "menubar.edit.deleteRedundantJoints",
      (context) => context.editing && !context.busy && !context.importing,
    ),
    item("resetSimulation", "menubar.edit.reset", (context) => context.editing && !context.busy),
    // Always allowed while editing: releasing a tag that is not forced changes nothing.
    item(
      "releaseAllTags",
      "menubar.edit.releaseAll",
      (context) => context.editing && !context.busy,
    ),
    "separator",
    item(
      "rename",
      "menubar.edit.rename",
      (context) =>
        context.selectedKind === "pantin" ||
        context.selectedKind === "body" ||
        (context.selectedKind !== null && isDeviceKind(context.selectedKind)),
      { key: "F2", primaryModifier: false, labelKey: "shortcut.rename" },
    ),
    item(
      "delete",
      "menubar.edit.delete",
      (context) =>
        (context.selectedKind === "body" ||
          context.selectedKind === "joint" ||
          (context.selectedKind !== null && isDeviceKind(context.selectedKind))) &&
        !context.busy,
      {
        key: "Delete",
        primaryModifier: false,
        labelKey: "shortcut.delete",
      },
    ),
    "separator",
    gizmoItem("gizmoMove", "menubar.edit.gizmoMove", "g", "shortcut.gizmoMove", "move"),
    gizmoItem("gizmoRotate", "menubar.edit.gizmoRotate", "r", "shortcut.gizmoRotate", "rotate"),
    {
      // ADR 0042 point 2: checked on the assembly's own axes (Local).
      ...item("gizmoSpace", "menubar.edit.gizmoSpace", (context) => context.gizmoAvailable, {
        key: "l",
        primaryModifier: false,
        labelKey: "shortcut.gizmoSpace",
      }),
      checked: (context) => context.gizmoSpace === "local",
    },
    {
      // ADR 0035: on the selected assembly, like the gizmo; checked while aligning.
      ...item(
        "align",
        "menubar.edit.align",
        (context) => context.gizmoAvailable || context.aligning,
        {
          key: "a",
          primaryModifier: false,
          labelKey: "shortcut.align",
        },
      ),
      checked: (context) => context.aligning,
    },
  ],
};
