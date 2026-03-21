# Room Editor

This is the design document for the rewrite of the Room Editor.

**Note:** Before implementation, the final layout and UI will be designed using the
frontend-design plugin and Figma (figma-remote-mcp). Screenshots and mockups will be
produced and reviewed before any code is written. This applies to all editors.

## Room List Panel

Status: Needs a text filter

Currently the list panel only has an area filter dropdown. Once you select an area, you
could still be looking at 250+ rooms with no way to narrow it down besides scrolling.

Add a text filter input (same datalist/type-to-filter pattern as the Area field) that
filters the room list by name or ID as you type. Combined with the area filter, this
gives two levels of narrowing: area first, then text search within that area.

> **Claude:** Agreed. This is listed in the main plan as a cross-cutting concern (every
> editor list panel needs a filter input), but the Room Editor benefits the most given
> room counts. The area filter + text search combo covers the common workflow: pick an
> area, then type a few characters to find the room.

## Name Input

Status: Good

The name input is fine. It should be just an area to type the name into.

## Area Input

Status: Good

The area seems to be a place you can type into, but it also seems like it sort of
filtered dropdown allowing you to begin typing and the dropdown filters out ones
that do not match.

> **Claude:** This is the `<datalist>` autocomplete pattern. It works well and is a good
> model for other fields that need the same "type to filter" behavior (exit target area,
> etc.).

## Terrain

Status: Good

A dropdown that shows the delay that accompanies each value.

> **Claude:** Confirmed. The speed multiplier is baked into the option labels in the HTML
> (e.g., "Road (0.8x - faster)"). Self-documenting, works fine as-is.
>
> Note: terrain types are hardcoded in two disconnected places (`commandQueue.json` on
> server, `<option>` elements in `editor.html` on client). A future TODO exists to make
> these dynamic so the editor fetches terrain types from the server. Not blocking for
> this redesign pass.

## Training Room Settings

Status: Good

I like the accordian style fold up so it moves it out of the way if not used.

> **Claude:** Note: the class checkboxes inside this section have the same scaling concern
> as the Respawn area checkboxes below. If class count grows beyond ~20, they'll need a
> multi-select with search. Fine for now.

## Bank Settings

Status: Probably okay. Discuss during design / layout phase.

I'm not sure if the accordian style fold up is necessary, but it does provide
a place to explain what it is for. It's possible a mouseover that produces a
bubble of text could explain it's use also.

> **Claude:** A small `(?)` icon with a hover popover would save vertical space vs the
> accordion while still providing explanation. The accordion is only one checkbox deep, so
> it's mostly just a label wrapper. Worth trying both during layout and seeing which feels
> better.

## Respawn Point Settings

Status: Will need some changes

The accordian is good, but when open it lists all the areas that exist get listed.
In the future there could be many areas that would end up cluttering up this configuration
area.

It's use is also confusing. It also says only one respawn point per area is used, but
then allows you to select multiple areas and provides a single priorty box. It definitely
isn't clear how this is actually supposed to work.

> **Claude:** Traced the code. Here's how it actually works:
>
> - A respawn room **automatically serves its own area**. The checkboxes add additional
>   areas it also covers.
> - The priority is **per-room, not per-area**. Lower number = higher priority.
> - When a player dies, the system finds ALL respawn rooms that serve the death area,
>   sorts by priority (ascending), and picks the lowest number.
> - If no respawn room covers the death area, it falls back to a global default, then
>   Room 1.
>
> **Example:** Room A (Arindale, priority 5, serves Sewer + Warrens) vs Room B (Arindale,
> priority 10, serves Sewer).
> - Die in Arindale: both match, Room A wins (5 < 10)
> - Die in Sewer: both match via servedAreas, Room A wins
> - Die in Warrens: only Room A matches
>
> **UI improvements needed:**
> 1. Label priority as "Respawn Priority (lower number wins)"
> 2. Add text: "This room automatically serves its own area ([current area])."
> 3. Label checkboxes as "Also serve as respawn point for:"
> 4. Area checkboxes need multi-select with search at scale (50+ areas)
> 5. Document all of this in the Help section (see Help section below)

## Exits

Status: It works well, but needs changes.

Once the exits are set, they are fine. What concerns me is the area selection and target room
selection. The dropdown for areas could get large, I think a dropdown that you can also type
in to filter would be a better choice similar to the Area input from above.

The same might be good for selecting the target room.

> **Claude:** Agreed. Both the exit area filter and target room dropdown should use the
> same filterable/searchable input pattern as the Area field. The target room dropdown is
> the most critical scaling issue in the editor (renders ALL rooms as `<option>` elements,
> will choke at 500+ rooms). SearchableSelect component will fix both.
>
> Also noted: the two separate area filters (room list panel vs exit target) cause
> confusion. Consider linking them or making the visual distinction clearer so devs know
> they're independent.
>
> One more: delete exit always sends `bidirectional=true`. Should offer the option to
> delete one-way, matching the "two-way" checkbox that exists on creation.

## Doors

Status: Not sure.

This seems okay, but if you click new door. Do you need to remember the door number and come back
to the page and then select it?

We will need to work this section out.

> **Claude:** Currently "New Door" navigates to the door editor with a query param
> (`?newDoorForRoom=123`), which means you leave the room editor entirely. With Phase 3's
> new-tab fix, the door editor would open in a new tab instead, which is better but still
> requires refreshing the room editor to see the newly created door.
>
> Options to discuss during design:
> 1. **Minimal fix:** Door editor opens in new tab (Phase 3). Room editor auto-refreshes
>    door list when it regains focus.
> 2. **Better:** Inline door creation form within the room editor for simple doors (name,
>    type, direction). Full door editor for advanced settings.
> 3. **Best but complex:** Embedded door editor panel that slides in from the side without
>    leaving the room editor.
>
> At minimum, the door list should show a clickable link that opens the door editor in a
> new tab (not navigates away).

## Map Preview

I really like this feature, but the only down side is it gets cramped in the window on the side.
The boxes start overlapping and especially when you view the entire area. It is too cluttered to
really see anything.

Maybe a better idea would be to pop it out and then allow zooming in and out of it to focus in on
specific areas.

> **Claude:** Agreed. The 350px sidebar is only useful for the immediate-neighbors view
> (Room mode). Area mode is unusable in that space.
>
> Proposed approach:
> - Keep the sidebar for Room mode (immediate neighbors). It works well there.
> - Area mode opens in a pop-out modal or resizable panel that can go full-width or even
>   full-screen.
> - Add zoom/pan controls (scroll wheel + drag) for the expanded view.
> - Clicking a room node on the map should select it in the editor.
> - Room name labels should show full name on hover (currently truncated to 10 chars).

## Help System

Status: Needs improvement

> **Claude:** Currently the help is a `?` link in the nav bar that opens a separate page.
> Two issues identified:
>
> 1. **Discoverability:** A lone `?` is easy to miss. Should be more prominent, either a
>    labeled "Help" button or an icon with text.
> 2. **Content:** Complex features like respawn priority, training room behavior, terrain
>    effects, etc. need proper documentation in the help section. Currently the UI doesn't
>    explain how these features work, and developers have to guess.
>
> **Proposed approach:**
> - Make the help link more visible: icon + "Help" text, or a more prominent button style.
> - Help opens in a new tab (consistent with Phase 3 editor-opens-in-new-tab pattern).
> - Help content should cover every editor feature with examples. Specifically for Room
>   Editor:
>   - How respawn priority works (lower wins, auto-serves own area, fallback chain)
>   - What each terrain type does (movement delay values)
>   - Training room behavior (level range, class filtering)
>   - How exits work (bidirectional vs one-way)
>   - How bank rooms work
>   - How door integration works
> - Consider inline `(?)` help icons next to complex fields that link to the relevant
>   help section or show a popover. This provides context-sensitive help without leaving
>   the editor.

## Darkness Level (Future Feature)

> **Claude:** Rooms will need a "Darkness Level" field for the future luminance system.
> A numeric value (0 = normal, -100 = dim, -200 = dark, -300 = pitch black, -500 =
> magical darkness). Add the field to the editor now with "(not yet implemented)" hint
> so it's ready when the system is built. See TODO.md for full luminance system design.

## Additional Proposed Improvements

> **Claude:** Items from the audit that weren't covered above:
>
> **Creation flow:**
> - "New Room" currently uses a browser `prompt()` dialog. Replace with an inline form or
>   modal that can pre-fill area from the current filter and validate before creation.
>
> **Missing features worth discussing:**
> - Room duplication (copy settings to a new room). Useful when building districts with
>   similar rooms.
> - Orphan detection: highlight rooms with no exits (disconnected from the world).
> - Exit validation: warn if an exit direction already exists before adding a duplicate.
>
> **Deferred (not for this pass):**
> - Undo/redo stack
> - Room templates (save/load configurations)
> - Collaborative editing / locking
> - Integrated ANSI map generator output
