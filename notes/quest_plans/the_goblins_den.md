# Quest: The Goblin's Den

**Tag:** `the_goblins_den`
**Area:** Hearthstead Wilds (cave)
**Target Level:** 3-4
**Steps:** 3
**Status:** Draft

## Overview

Armed with evidence of goblins from the torn journal, Garak sends the player into the cave to deal with the goblin threat. The player pushes through the cave, fighting cave spiders along the way, and confronts the corrupted goblin in its den. This quest introduces the cave dungeon and builds toward the final Hearthstead boss encounter.

## Prerequisites

- Min level: 3
- Max level: none
- Required quests: `trouble_in_the_wilds` (via requiredQuestTags)
- Required faction: none

## NPCs Involved

| NPC | Role | New/Existing | Location |
|-----|------|-------------|----------|
| Garak | Quest giver | Existing | Hearthstead Inn, Back Hall |
| cave spider | Cave creature | **New** | Hearthstead Wilds cave passages |
| corrupted goblin | Elite kill target | **New** | Goblin's Den (hs_cave_k) |

## Step Breakdown

### Step 1: Talk to Garak
- **Trigger:** talk
- **Target:** Garak
- **Trigger text:** "cave"
- **Description (journal):** Speak with {npc}Garak{/} at the {location}Hearthstead Inn{/} about the {yellow}cave{/}.
- **Completion dialogue:**
  Garak's jaw tightens. "That journal confirmed what I feared. Goblins have settled into the cave north of the forest." He pushes a rough sketch across the table. "Head back through the {location}Hearthstead Wilds{/} and keep going north until you find the {location}cave mouth{/}. The tunnels twist, so keep your bearings. Somewhere deep inside, there's a {npc}goblin{/} running things. Kill it, and the rest will scatter." He pauses. "Watch for spiders in there. The cave is thick with them."
- **In-progress dialogue:** (none, this is step 1)

### Step 2: Kill the corrupted goblin
- **Trigger:** kill
- **Target:** corrupted goblin
- **Required count:** 1
- **Description (journal):** Find and kill the {npc}corrupted goblin{/} in the {location}Goblin's Den{/} deep within the cave.
- **Completion dialogue:**
  The goblin crumples with a snarl, crude weapons clattering to the stone floor. Stolen supplies and gnawed bones litter its den. Whatever drew this creature here, it won't be troubling anyone else. But deeper in the tunnels, a low growl echoes off the walls. Something larger is down there.
- **In-progress dialogue:** (Garak) "The goblin is still alive? Get back in there."

### Step 3: Report to Garak
- **Trigger:** talk
- **Target:** Garak
- **Trigger text:** "goblin dead"
- **Description (journal):** Return to {npc}Garak{/} at the {location}Hearthstead Inn{/} and report the {yellow}goblin dead{/}.
- **Completion dialogue:**
  Garak nods, visibly relieved. "One less problem. But you said you heard something deeper?" He frowns. "That cave goes further than anyone realized. I've heard stories of a {npc}beast{/} laired in the deepest tunnels. Bones, scraps, the works." He slides your payment across the table. "Rest up and get stronger. When you're ready, come talk to me about the {yellow}beast below{/}. That thing needs to be dealt with before winter drives it out looking for food."
- **In-progress dialogue:**
  "Is the goblin dead? Get back in there and finish the job."

## Final Rewards

- XP: 400
- Essence: 80
- Currency: 300 copper (3 silver display)
- Items: none
- Faction: none
- Quest flag: `the_goblins_den`

## Lore Notes

This quest is the cave introduction. Players learn the cave layout fighting spiders on their way to the goblin. Garak's completion dialogue explicitly sets up "The Beast Below" with the trigger phrase "beast below." The goblin is an elite mob, a noticeable step up from forest creatures but not overwhelming for a level 3 player with basic gear and spells.

## New NPCs

### Cave Spider (level 3, normal melee)
Pale-bodied spider adapted to cave darkness. Multiple spawn points in cave passages. Standard difficulty, provides XP and some resistance on the path to the goblin.

### Corrupted Goblin (level 4, elite melee)
Wiry goblin with yellowed eyes, wearing crude armor cobbled from stolen gear. Single spawn in Goblin's Den (hs_cave_k). Has call-for-help ability to pull nearby cave spiders. Higher HP and damage than normal mobs; the player should feel the difficulty spike.
