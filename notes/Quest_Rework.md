# Quest Output Rework

**Status:** Implemented. Color markup, narrative-only output, editor NPC search, and preview all done. See Quest_Plan.md for the Color Markup Reference.

## Problem

The current quest output is too "form-like." Every quest event is wrapped in ASCII box-drawing borders:

```
 ───── New Quest: Test Quest ──────────────
 Quest text here...
 ──────────────────────────────────────────
   Current objective: Do the thing
```

```
 ══════════════════════════════════════════
           Quest Complete!
        Test Quest
 ──────────────────────────────────────────
 Rewards:
   500 experience points
   150 gold
 ══════════════════════════════════════════
```

This feels like a form or dialog box, not a narrative MUD experience. The borders, centered text, labeled sections ("Current objective:", "Rewards:"), and rigid structure break immersion.

## Goal

Replace the bordered form output with **narrative prose** that the quest designer writes as sentences and paragraphs. The designer has full control over what the player reads, including which words are highlighted in color to draw attention to key information (NPC names, trigger phrases, locations, items).

## Design: Inline Color Markup

Quest text fields (completion_dialogue, description, in_progress_dialogue, denial_dialogue) support a lightweight color markup syntax. The designer writes prose with embedded color tags.

### Tag Syntax

```
{color}text{/}
```

- `{color}` opens a color span. `{/}` closes it back to the base color.
- Supported color names match the existing `colors.ts` palette: `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `brightRed`, `brightGreen`, `brightYellow`, `brightBlue`, `brightCyan`, `brightWhite`, `gray`, `gold`, `bold`, `boldCyan`, `boldGreen`, `boldYellow`, `boldRed`, `boldWhite`, `item`, `npc`, `player`, `system`, `error`, `location`.
- Tags are case-insensitive: `{Cyan}` and `{cyan}` both work.
- Nesting is not supported. Opening a new color tag implicitly closes the previous one.
- Unclosed tags auto-close at end of text. Unrecognized tag names are left as literal text.

### Base Color

Each quest output context has a **base color** that applies to all untagged text:

| Context | Base Color |
|---|---|
| Quest start / step completion dialogue | `green` |
| Quest complete summary | `green` |
| In-progress dialogue | `green` |
| Denial dialogue | `green` |
| Quest log objective text | `green` |
| Kill progress updates | `white` |

The base color is applied automatically. The designer only uses tags to highlight specific words that differ from the base.

**Quest Dialogue Color Conventions:**
- NPC/mob names: `{npc}` (magenta)
- Keywords/trigger phrases: `{yellow}` (what to say/do)
- Locations: `{location}` (cyan, where to go)
- Items: `{item}` (bright blue)

Dialogue is rendered with a 4-space left indent and 70-character wrap width.

### Example: Quest Start

**What the designer writes** (in the completion_dialogue field of step 1):

```
Elder Maren leans in close and whispers, "The ruby was stolen from the cathedral vault. Seek out {npc}Bob the Builder{/} in the {location}Ironwood District{/}. Tell him: {yellow}ask about the ruby{/}. He will know what to do."
```

**What the player sees** (green base with magenta NPC name, cyan location, yellow trigger phrase, indented 4 spaces):

```
    Elder Maren leans in close and whispers, "The ruby was
    stolen from the cathedral vault. Seek out Bob the Builder
    in the Ironwood District. Tell him: ask about the ruby.
    He will know what to do."
```

No borders. No "New Quest:" header. No "Current objective:" label. Just the narrative text, indented 4 spaces and word-wrapped to 70 characters, with color highlighting where the designer placed it.

## Core Rule: Designer Text Only

**The system never injects any text around quest dialogue.** No headers, no footers, no labels, no borders, no `[Quest accepted]`, no `[Quest complete]`, no `[Rewards:]` block. The only text the player sees is exactly what the quest designer wrote in the dialogue fields, rendered with color markup and word-wrapped.

The quest designer is fully responsible for conveying everything through their prose: that a quest has started, what the player should do, that the quest is finished, and what they received. If the NPC hands the player gold and a ring, the designer writes that into the narrative. The system grants the rewards silently behind the scenes.

The player can always use the `quest` command to check status, objectives, and progress. But quest events themselves are pure narrative.

## What Changes Per Quest Event

### Quest Start (first step triggered)

**Current:** Bordered box with "New Quest: Name" header, dialogue text, bottom border, "Current objective:" label.

**New:** Only the step's `completionDialogue`, rendered with color markup and word-wrapped. Nothing else.

```
Elder Maren leans in close and whispers, "The ruby was stolen
from the cathedral vault. Seek out Bob the Builder in the
Ironwood District. Tell him: ask about the ruby. He will know
what to do."
```

The designer wrote the dialogue to establish the quest. The system adds nothing.

### Step Completion (mid-quest)

**Current:** Bordered box with "Quest Update: Name" header, dialogue text, bottom border, next objective label.

**New:** Only the step's `completionDialogue`, rendered with color markup and word-wrapped. Nothing else.

```
Bob nods slowly and pulls a worn map from his pack. "The thief
fled through the sewers. Find the entrance near the harbor and
follow the northern tunnel. You will find a locked iron gate.
This key should open it." He hands you a rusty iron key.
```

### Quest Completion (final step done)

**Current:** Double-bordered box with centered "Quest Complete!" and quest name, "Rewards:" section listing XP/gold/items.

**New:** Only the final step's `completionDialogue`, rendered with color markup and word-wrapped. Nothing else. Rewards (XP, currency, items, faction rep) are granted silently. The designer writes the narrative to convey what happened.

```
Elder Maren takes the ruby and holds it to the light. "You have
done a great service to the cathedral. This will not be
forgotten." She reaches into her robes and produces a small
pouch. "Take this, with my gratitude."
```

The player receives 500 XP, 2 gold, and Ancient Ring in their inventory. None of this is printed. The designer's prose ("produces a small pouch") is the only indication. If the player wants specifics, they check their inventory or use the `quest` command.

### In-Progress Dialogue

**Current:** Plain text response when player talks to NPC but hasn't met step requirements.

**New:** Same approach. Only the `inProgressDialogue` text, rendered with color markup. No borders were used here before, so this is minimal change.

### Denial Dialogue

Only the `denialDialogue` text, rendered with color markup. Designer writes the NPC's refusal.

### Kill Progress Updates

**Current:** `Quest progress: Kill 3 sewer rats (2/3)` in plain text.

**New:** Keep as-is. This is a system counter triggered by combat, not NPC dialogue. It's the one exception where the system generates text, because kill tracking has no associated dialogue field.

### Quest Commands (`quest`, `quest log`)

These are player-initiated status commands, not quest events. They show objectives, progress, and completion state in whatever structured format works best for readability. These are the place for labels like "Current objective:" and progress counters. The quest event output (above) never shows this information unprompted.

## Quest Editor Changes

### Color Markup Support

The quest editor text fields (completion_dialogue, description, in_progress_dialogue, denial_dialogue) need:

1. **Color tag reference** visible near the text areas (a small legend or help tooltip listing available color names).
2. **Preview rendering** that approximates the color output. The editor runs in a browser, not a terminal, so preview would use `<span>` elements with CSS color classes to simulate the ANSI output. This gives the designer a rough visual of what the player will see.

### NPC Search Boxes

Currently, NPC fields (quest giver NPC on the Basic tab, trigger NPC on each step card) are bare `<input type="number">` fields. The user must know the numeric NPC ID. This needs to change to a **searchable text input** that:

- Lets the user type an NPC name and see matching results in a dropdown
- Shows the NPC name and ID in results (e.g., "Elder Maren (#12)")
- Stores the numeric ID internally when a result is selected
- Displays the NPC name (not just the ID) when a quest is loaded
- Falls back gracefully if the NPC is deleted (show "Unknown NPC #12")

This applies to both the quest giver field and the per-step trigger NPC field. The same pattern should apply to room ID and item template ID fields on steps (type a name, get a searchable dropdown), but NPC is the priority.

The NPC list is already available via `GET /api/npcs` and is loaded on editor init.

### Consume Item Toggle Overlap Fix

The "Consume Item" toggle slider overlaps the "Consume Item" label text. Root cause: the toggle sits in a 2-column grid row (`step-row`) next to the Trigger Text input, and uses an inline `style="margin-top: 18px"` hack to try to align with the adjacent input field. The toggle track is visually covering the label text.

Fix: Remove the inline margin-top hack. Align the toggle properly within its grid cell, likely by using `align-self: end` on the step-field or restructuring so the toggle label sits below a proper label element like the other fields in the row.

## Implementation: Color Markup Parser

A new utility function in `textFormat.ts` (or a new `questFormat.ts`):

```typescript
/**
 * Parse color markup tags in text and return ANSI-colored string.
 * Syntax: {colorName}highlighted text{/}
 * Untagged text uses the provided baseColor.
 */
function renderColorMarkup(text: string, baseColor: string): string
```

Processing steps:
1. Split text on `{...}` tag boundaries
2. For each tag, look up the color name in a map of allowed colors
3. Apply the corresponding ANSI code; `{/}` resets to baseColor
4. Unrecognized tags are left as literal text (not stripped)
5. Apply `wordWrap()` AFTER stripping tags for width calculation but BEFORE inserting ANSI codes (ANSI codes are zero-width in the terminal but have string length, so wrapping must account for this)

### Word Wrap Consideration

This is the trickiest implementation detail. ANSI escape codes have string length but zero visual width. The word wrap function needs to calculate visual width (excluding ANSI codes) when deciding where to break lines, but preserve the codes in the output.

Options:
1. **Parse markup first, wrap on plain text, then re-insert codes.** Most reliable. Strip all tags to get plain text, run word wrap, then re-apply colors to the wrapped result by tracking tag positions.
2. **Make wordWrap() ANSI-aware.** Modify the existing wordWrap to skip ANSI escape sequences when counting line width. This is more generally useful but a bigger change.
3. **Wrap first on markup text, render colors after.** Run word wrap on the text with `{tags}` still as literal strings (they'll slightly inflate the width calculation). Then replace tags with ANSI codes. Approximate but simple; tags are short so the wrap points will be close to correct.

Recommendation: **Option 2** (ANSI-aware wordWrap) since it benefits all colored output, not just quests. The change is isolated to the wordWrap function.

## Files to Modify

| File | Change |
|---|---|
| `packages/server/src/utils/textFormat.ts` | Add `renderColorMarkup()` function. Make `wordWrap()` ANSI-aware. |
| `packages/server/src/game/questManager.ts` | Replace `sendQuestStartMessage`, `sendStepCompleteMessage`, `sendQuestCompleteMessage` with new narrative-style rendering using `renderColorMarkup()`. |
| `packages/client/src/quest-editor.ts` | Add color tag reference/legend near text areas. Add preview rendering with CSS-based color simulation. Replace NPC numeric inputs with searchable dropdowns. Fix Consume Item toggle overlap. |
| `packages/client/src/quest-editor.css` | Fix toggle alignment in step cards. Styles for NPC search dropdown and color preview. |
| `packages/client/quest-editor.html` | Replace quest giver NPC `<input type="number">` with search input. |

## Schema Changes

None. The text fields already store plain text strings. The markup tags are embedded in the text content. No new columns or tables needed.

## Resolved Questions

1. **Quest command format:** The `quest` command uses a bordered list showing active quests with current objectives and kill progress. The `quest log` command uses a bordered panel with description and completed/current steps. Rewards are not shown.
2. **Base color per-quest:** A single system-wide base color is used. No per-quest override.
3. **Bold as a modifier vs. standalone:** `{bold}` works as a standalone tag mapped to `colors.boldWhite`. Combined tags like `{boldCyan}` are also supported.
