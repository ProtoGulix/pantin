# Group, ungroup, move a body

These procedures set the structure of a Pantin: which bodies move together. After each change, check your joints in the **Joints** view: it shows groups as rounded rectangles, with the number of bodies that follow them, and whatever stays attached to World (see [The Joints view](/en/reference/views#the-joints-view)). The words **body**, **assembly** and **group** are defined in [The model of a Pantin](/en/guide/model#concepts-body-assembly-group).

## Make a group

Make a group when the import did not separate what moves. A STEP with no sub-assembly, for example, puts all bodies in a single assembly, with no joint.

**Group…** creates a sub-assembly with the chosen bodies. A fixed joint links it to the original assembly.

1. In the tree, click the first body. Add the others with <kbd>Ctrl</kbd>+click (adds or removes a row), <kbd>Shift</kbd>+click (the range up to the clicked row) or <kbd>Shift</kbd>+arrows. The items selected together are bodies and sub-groups of **one assembly**.
2. Choose **Edit** then **Group…**, or **Group…** in the context menu of a selected row.
3. A line appears under the tree: `Group N items of assembly "X": what should the group be called?`. Type the name in the **Group name** field, then click **Group** (or **Cancel**).
4. The message `Group "name" created.` appears.

![The left panel: two bodies selected, and the line asking for the name of the group](/screenshots/en/group-prompt.webp)

Nothing moves on screen. The group is attached to the assembly by a **Fixed** joint of the same name. To make the whole group move, turn this joint into a **Prismatic (slider)** or a **Revolute (limited pivot)**.

**Group…** is offered only if the selection is made of bodies and sub-groups of one assembly, filed in a Pantin.

The message can add two sentences:

- **Joints deleted: …**: fixed joints made useless between the bodies of the group and the rest of the assembly are removed.
- **Tags were renamed: regenerate the PLC's GVL.**: the joints of the moved bodies take the prefix of the new group, so their tags change. `io.json` follows. You must however **export the GVL again** (see [The I/O list](/en/guide/tags#the-i-o-list-io-json)) and reload it in the PLC program.

### When the core refuses

The core refuses, without changing anything, when the group would move a body against its will. It shows its message word for word. Frequent cases:

| Situation | What to do |
| --- | --- |
| A body of the group hangs, by a moving joint, from a body of the assembly that is not in the group: the group would take it along. | Add the parent body to the group, or delete the joint. |
| A body of the group is linked by a joint to a body that is not in the group: the group would leave it behind. | Add that body to the group, or delete the joint. |
| A joint to delete is used by a drive, an actuator, a sensor or a belt. | Remove that element first, then try again. |

## Ungroup a group

**Ungroup** dissolves a group into the assembly where it is filed. Its bodies and sub-groups move into that assembly, without moving on screen.

1. Select the row of the group (an assembly filed inside another assembly).
2. Choose **Edit** then **Ungroup**, or **Ungroup** in its context menu.
3. The message `Group "name" dissolved.` appears, with the same optional sentences as for **Group…** (joints deleted, GVL to regenerate).

A top-level assembly cannot be ungrouped: there is no assembly to pour it into.

The core refuses as long as the bodies of the group would stop following it. Frequent cases:

| Situation | What to do |
| --- | --- |
| A slider or a pivot moves the group: its bodies would no longer follow. | Make that joint **Fixed**, or delete it, then ungroup. |
| The group is held by a joint to an assembly other than the one it would dissolve into. | Delete that joint or change its parent. |
| The group does not move, but the assembly it would dissolve into is moved by a joint: its bodies would start following it. | Ungroup when that assembly does not move, or first hold the group with a fixed joint to it. |
| The group hangs from something that moves inside the destination assembly. | First change the parent of that joint. |
| A tag key of an element of the group already exists in the destination assembly (the message proposes a free key). | Rename one of the two keys. |

Group then ungroup does not always give back the starting Pantin. Nothing moves on screen, but the fixed joints that were deleted are not restored, and identifiers or tag keys may differ. To go back, discard the unsaved changes.

## Clean up old fixed joints

A Pantin made before groups often holds fixed joints between bodies of one assembly. A body with no parent joint already follows its group, so these joints do nothing. **Delete redundant fixed joints…** removes them in one go.

1. Choose **Edit** then **Delete redundant fixed joints…**, or the same entry in the context menu of the Pantin row. The command acts on the whole Pantin, not on the selection.
2. With no joint to delete, the message `No redundant fixed joints.` appears and nothing else happens.
3. Otherwise a line appears: `Delete N redundant fixed joints? The bodies already follow their group: nothing moves.` It is followed by two lists, each with a heading and a count:
   - **To delete (N)**: the joints removed, listed by assembly;
   - **Kept (N)**: the fixed joints kept, with the reason, for example `its parent moves with "name"`. This list appears only if the core keeps some.
4. Click **Delete** (or **Cancel**). The message gives the joints deleted and reminds you that **Don't save**, when closing, undoes the operation. A joint changed or deleted between the preview and your click is left out and counted in the message as skipped.

The core deletes a fixed joint only when deleting it moves nothing: the parent and the child are in the same assembly, and no moving joint sits above the parent. A fixed joint between two assemblies is never offered: it holds the child group in place. A fixed joint under a slider or a pivot is kept.

The Pantin looks the same. Nothing is written to disk before saving. No tag is renamed: there is no GVL to regenerate.

## Move a body to another assembly

Drag a body onto another assembly, or choose the **Assembly** in the inspector. The fixed joints between the body and the old assembly are deleted and listed in the message.

The core refuses the move in these cases:

- the body, its old group and its new group are not moved by the same joint (or by none): then move the whole group, or use **Group…**;
- a moving joint links the body to the old assembly (`Joint "…" (…) links … and moves. Delete it or make it a group joint first, then move the body.`);
- the body would "jump" when the groups move (`Body "…" would jump when the groups move: … Move it to an assembly that moves with "…".`);
- a fixed joint to delete is used by another element.
