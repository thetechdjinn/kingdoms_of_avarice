# Action Editor

This is the design document for the rewrite of the Action Editor.

**Note:** Before implementation, the final layout and UI will be designed using the
frontend-design plugin and Figma (figma-remote-mcp). Screenshots and mockups will be
produced and reviewed before any code is written. This applies to all editors.

## Overview

The simplest editor in the project. Manages social actions (bow, wave, dance, etc.)
with message templates for different audiences. Functionally complete — the main work
is layout efficiency.

## Layout

Three-panel: action list (left, 250-300px), form (center, flex), preview (right,
280-350px).

> **Claude:** The three-panel layout works but may be overkill for this editor. The
> form only has 7 text fields total — no tabs, no type switching, no complex sections.
> The preview panel takes up significant space for what amounts to showing 6 lines of
> text with placeholder substitution.
>
> **Layout options to consider during design phase:**
> 1. Keep three-panel but tighten widths — the preview could be narrower since it's
>    just text lines
> 2. Two-panel: list + form with preview collapsed/expandable below the form. Gives
>    the form more horizontal space
> 3. Two-panel: list + form with preview inline below each message field (show what
>    each field looks like as you type, right below the input)
>
> The inline preview option (3) could be the most space-efficient — each message input
> has a small preview line below it showing the rendered output with test names. No
> separate preview panel needed.

## Action List Panel

Status: Good

Search input filters by command or description. Import/Export buttons in footer.

> **Claude:** Simple and effective. No type filter needed since actions don't have
> categories. If categories are added in the future (see below), a filter dropdown
> would be warranted.

## Form Fields

### Command

Status: Good. Required text input. The verb the player types (e.g., "dance", "bow").

### Description

Status: Good. Optional text input. Brief help text shown in `help actions` output.

### No Target Messages (required)

**Self Message** — what the actor sees (e.g., "You bow gracefully.")
**Room Message** — what others see (e.g., "{player} bows gracefully.")

Status: Good. Both required. {player} placeholder in room message.

### With Target Messages (optional — all three required to enable targeting)

**Self Message** — what the actor sees (e.g., "You bow to {target}.")
**Target Message** — what the target sees (e.g., "{player} bows to you.")
**Room Message** — what others see (e.g., "{player} bows to {target}.")

Status: Good. The all-or-nothing targeting toggle is smart — if any of the three is
empty, targeting is disabled and the preview shows "(targeting disabled)".

> **Claude:** All fields are single-line text inputs. For longer messages, textareas
> might be more appropriate (some actions have longer prose). But for typical social
> actions ("You wave." / "{player} waves.") single-line is fine. Could revisit during
> design if messages tend to be longer than expected.

## Preview Panel

Status: Good functionality, could be more space-efficient.

Shows live preview with test names (You, Bob, Alice) for all audiences. Updates in
real-time on every keystroke. With-target section shows as muted/disabled if targeting
fields are incomplete.

> **Claude:** The preview works well. The real-time update on every keystroke is good
> UX. The muted state for incomplete targeting is clear visual feedback.
>
> As noted in layout section, consider inline preview below each field instead of a
> separate panel. Each input would show a small gray line below it with the rendered
> text: "→ Bob bows gracefully." This gives immediate feedback per-field without
> needing to look at a separate panel.

## Creation Flow

Status: Needs minor improvement.

"+ New Action" clears the form for a new entry. No prompt() — better than most editors.

> **Claude:** This is actually one of the better creation flows since it doesn't use
> prompt(). Just clears the form and you start typing. The command field is required
> validation. Good as-is.

## Duplicate

Status: Minor issue.

Appends "_copy" to command.

> **Claude:** Could be smarter — auto-increment ("wave_2") or let the user provide the
> name. But this is minor given how simple the editor is.

## Import/Export

Status: Good. JSON with merge option (upserts by command name).

## Missing Features

> **Claude:**
>
> - `[PROPOSED]` Action categories/tags (emote, combat, roleplay). Would help organize
>   the in-game `help actions` output into groups. Currently all actions are one flat
>   list. Low priority — works fine without it, just organizational.
> - `[PROPOSED]` Command aliases (e.g., "wave" and "wav" trigger the same action).
>   Players might type abbreviations. Low priority.
> - `[PROPOSED]` Duplicate command detection — warn if creating an action with a command
>   name that already exists before saving (currently only the server rejects it).

## Help Section

> **Claude:** Help documentation should cover:
> - How placeholders work ({player} = actor's name, {target} = target's name)
> - How targeting works (all three target fields required, or targeting is disabled)
> - How to test actions in-game (just type the command)
> - The /me command for custom emotes (mentioned in preview panel but could be expanded)
> - Message conventions: tense, punctuation, capitalization patterns to keep actions
>   consistent
