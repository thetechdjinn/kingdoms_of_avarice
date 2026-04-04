# Quest: The Beast Below

**Tag:** `the_beast_below`
**Area:** Hearthstead Wilds (cave)
**Target Level:** 4-5
**Steps:** 3
**Status:** Draft

## Overview

With the goblin dealt with, Garak reveals the greater threat: something large and dangerous lairs in the deepest chamber of the cave. The player must return to the cave and confront the cave bear in its bone-littered burrow. This is the capstone quest for Hearthstead, after which players are ready to head south to Arindale.

## Prerequisites

- Min level: 4
- Max level: none
- Required quests: `the_goblins_den` (via requiredQuestTags)
- Required faction: none

## NPCs Involved

| NPC | Role | New/Existing | Location |
|-----|------|-------------|----------|
| Garak | Quest giver | Existing | Hearthstead Inn, Back Hall |
| cave bear | Boss kill target | **New** | Bone-Littered Burrow (hs_cave_b) |

## Step Breakdown

### Step 1: Talk to Garak
- **Trigger:** talk
- **Target:** Garak
- **Trigger text:** "beast below"
- **Description (journal):** Speak with {npc}Garak{/} at the {location}Hearthstead Inn{/} about the {yellow}beast below{/}.
- **Completion dialogue:**
  Garak's expression is grave. "You heard it down there. Something big has made its lair in the deepest part of that cave." He taps the table. "The {npc}cave bear{/}. Bones everywhere, from what the old miners used to say. Nobody's gone that deep in years." He meets your eyes. "You've proven yourself against goblins and spiders. This is the real test. Head back to the {location}cave{/}, push past the {location}Goblin's Den{/}, and find the {location}Bone-Littered Burrow{/} at the very end. Kill the bear. End this."
- **In-progress dialogue:** (none, this is step 1)

### Step 2: Kill the cave bear
- **Trigger:** kill
- **Target:** cave bear
- **Required count:** 1
- **Description (journal):** Slay the {npc}cave bear{/} in the {location}Bone-Littered Burrow{/} at the deepest point of the cave.
- **Completion dialogue:**
  The massive bear collapses with a shuddering roar that echoes through the cavern. Silence follows. Bones of animals and less fortunate travelers are scattered across the burrow floor. The air is thick with the stench of old kills. With the bear dead, the cave is finally safe.
- **In-progress dialogue:** (Garak) "The bear still lives? You need to finish this."

### Step 3: Report to Garak
- **Trigger:** talk
- **Target:** Garak
- **Trigger text:** "bear slain"
- **Description (journal):** Return to {npc}Garak{/} at the {location}Hearthstead Inn{/} and report the {yellow}bear slain{/}.
- **Completion dialogue:**
  Garak stares at you for a long moment, then breaks into a wide grin. "You actually did it." He pushes a heavy pouch across the table and clasps your hand. "The hamlet owes you a debt, {name}. The cave is clear, the forest is safe, and the farmers can sleep without worry." He releases your hand and leans back. "You've outgrown this place. The road south leads to the {location}river crossing{/}. Swim across and follow it to {location}Arindale{/}. That's where the real opportunities are." He raises his mug. "Watch your back out there. The world beyond these woods is not as forgiving."
- **In-progress dialogue:**
  "Is the bear dead? Don't come back until it is."

## Final Rewards

- XP: 600
- Essence: 120
- Currency: 500 copper (5 silver display)
- Items: none (could add a unique item reward later)
- Faction: none
- Quest flag: `the_beast_below`

## Lore Notes

This is the capstone quest for the Hearthstead area. Completing it signals the player is ready for Arindale. Garak's final dialogue explicitly directs them to the river crossing and Arindale, closing the tutorial arc. The quest flag `the_beast_below` could be used later by an Arindale NPC to recognize the player.

The cave bear is a boss mob: high HP, powerful attacks, but beatable by a level 4 player with basic gear and spells. The fight should feel like a genuine accomplishment.

## New NPCs

### Cave Bear (level 5, boss melee)
A massive brown bear that has made its lair in the deepest chamber of the cave. Extremely high HP, powerful claw attacks, but somewhat slow. The toughest fight in Hearthstead. Single spawn in Bone-Littered Burrow (hs_cave_b).
