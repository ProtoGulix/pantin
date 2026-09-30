# 0027. A welcome window instead of the Pantin list

- Status: accepted
- Date: 2026-09-30
- Replaces: the list view of the side panel

## Context

With no Pantin open, the viewer shows a list of Pantins in the left panel,
next to an empty 3D view. The user, used to SolidWorks, asked on 2026-09-30
for a home page in the style of its Welcome dialog: a window centred over the
empty workspace, with a "New" row, recent documents, and resources. The API
lists each Pantin with its id, name and body count only
(`PantinSummarySchema`, packages/protocol/src/api.ts); it gives no date.

The user chose: a centred window, icons without thumbnails, and four
sections: New, Recent with dates, All Pantins, Resources.

## Decision

1. **A welcome window.** While no Pantin is open, a dialog centred over the
   empty 3D view replaces the left panel's list; the left panel is hidden.
   Escape or its close button hides it and shows the empty workspace; "File >
   Welcome" and closing a Pantin bring it back. It is a modal dialog for
   assistive technologies (`role=dialog`, focus kept inside).
2. **Two tabs.** "Home" and "All Pantins".
   - Home, top to bottom: **New**, **Recent**, **Resources**.
   - All Pantins: every Pantin in a list (the current listbox, keyboard
     included), with a filter on name and id, sorted by last modification.
3. **New.** "Empty Pantin" asks for a name, as the toolbar's + does. "From a
   3D file" asks for a file (GLB, STL, STEP), creates a Pantin named after it
   and imports the file into it, through the existing create and import
   calls; nothing new in the core.
4. **Recent.** The six most recently modified Pantins as cards: an icon, the
   name, the body count and the date of last modification. A click opens the
   Pantin (one click, as a card is a button, unlike a list row).
5. **The date comes from the core.** `PantinSummary` gains `modifiedAt`, the
   last modification time of `pantin.json` as an ISO 8601 string. It is an
   API response, not a document: `pantin.json` and its schema version do not
   change. The field is added, so older clients are unaffected.
6. **Resources.** Links to the repository, the guides
   (`docs/guides`) and the decisions (`docs/decisions`) on GitHub, opened in
   a new tab, and the keyboard shortcuts listed in place. Nothing is fetched
   from the network by the viewer itself.

## Rejected alternatives

- A full page without the 3D view: the user preferred the SolidWorks window.
- Keeping the left-panel list with more detail: the smallest change, but not
  what the user asked for.
- Thumbnails captured at each save: the user chose icons; they would need an
  upload endpoint and an image in each Pantin folder.
- "Open an example" (examples/): the core serves only its Pantins folder, so
  it needs an endpoint copying an example into it. Left to the backlog.

## Consequences

- The side panel loses its list view; the list's keyboard handling moves into
  the dialog. The viewer's two session views (no Pantin open, one Pantin
  open, `session-state.ts`) do not change.
- NOT VERIFIED: the repository https://github.com/ProtoGulix/pantin is
  public; if it is not, the resource links only work for its members.
- A file edited outside Pantin gets a new date: the recent list follows the
  file, which is what the user sees on disk.
