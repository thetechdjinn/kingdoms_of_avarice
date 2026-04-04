# Quest: Trouble in the Wilds

**Tag:** `trouble_in_the_wilds`
**Area:** Hearthstead Wilds (forest)
**Target Level:** 2-4
**Steps:** 4
**Status:** Draft

## Overview

Garak has heard reports of something disturbing in the forest north of the trail loop. He sends the player through the hidden path into the Hearthstead Wilds to investigate. The player fights through new, tougher creatures in the forest, discovers an abandoned campsite with a torn journal hinting at a goblin presence in a nearby cave, and returns the journal to Garak. This quest bridges the tutorial loop and the cave dungeon.

## Prerequisites

- Min level: 2
- Max level: none
- Required quests: `fresh_start` (via requiredQuestTags)
- Required faction: none

## Items

| Item | Type | Rarity | Flags | Purpose |
|------|------|--------|-------|---------|
| torn journal | misc | quest | no_drop | Found at campsite (step 3), returned to Garak (step 4, consumed) |

## NPCs Involved

| NPC | Role | New/Existing | Location |
|-----|------|-------------|----------|
| Garak | Quest giver | Existing | Hearthstead Inn, Back Hall |
| timber rat | Kill target | **New** | Hearthstead Wilds (forest trails) |
| forest viper | Kill target | **New** | Hearthstead Wilds (forest trails) |

## Step Breakdown

### Step 1: Talk to Garak
- **Trigger:** talk
- **Target:** Garak
- **Trigger text:** "more work"
- **Description (journal):** Speak with {npc}Garak{/} at the {location}Hearthstead Inn{/} and ask about {yellow}more work{/}.
- **Completion dialogue:**
  Garak lowers his voice. "Something's been stirring in the forest north of the loop. Farmers are finding tracks they don't recognize, and a trapper went missing last week." He traces a path on the table with his finger. "Head to the trail loop and look for an {location}overgrown clearing{/}. There's a hidden path heading north. Type {yellow}go path{/} to follow it into the {location}Hearthstead Wilds{/}. Push through and look for anything unusual. Be careful; the creatures out there are tougher than the vermin on the loop."
- **In-progress dialogue:** (none, this is step 1)

### Step 2: Kill 8 timber rats
- **Trigger:** kill
- **Target:** timber rat
- **Required count:** 8
- **Description (journal):** Kill 8 timber rats in the {location}Hearthstead Wilds{/}.
- **Completion dialogue:** (none, advances to next step)
- **In-progress dialogue:** (Garak) "The wilds are still dangerous. Keep at it."

### Step 3: Visit the Abandoned Campsite
- **Trigger:** visit
- **Target:** hs_wilds_20 (Abandoned Campsite)
- **Step item reward:** torn journal (x1)
- **Description (journal):** Explore the {location}Hearthstead Wilds{/} and investigate the {location}Abandoned Campsite{/}.
- **Completion dialogue:**
  The campsite is a mess. A collapsed tent lies half-buried in fallen leaves, and scattered supplies are strewn across the ground. Near the cold fire pit, you find a {item}torn journal{/} wedged under a rock. The last entry is scrawled in a shaking hand: "Something in the cave to the north. Not animals. They took my pack and nearly took my life. Green skin, yellow eyes. Do not go in alone."
- **In-progress dialogue:** (none, visit trigger)

### Step 4: Return the journal to Garak
- **Trigger:** talk
- **Target:** Garak
- **Trigger text:** "journal"
- **Required item:** torn journal
- **Consume item:** true
- **Description (journal):** Return the {item}torn journal{/} to {npc}Garak{/} at the {location}Hearthstead Inn{/} and tell him about the {yellow}journal{/}.
- **Completion dialogue:**
  Garak reads the journal, his expression darkening. "Green skin, yellow eyes. Goblins." He sets the journal down carefully. "This is worse than I thought. That cave has been sealed for years. If goblins have moved in, there's no telling what they've been doing in there." He slides payment across the table. "You've done good work. Rest up and come talk to me when you're ready for a {yellow}real fight{/}. We need to deal with whatever's in that {location}cave{/} before it spills out into the hamlet."
- **In-progress dialogue:**
  "Found anything out there yet? Keep looking. Check the campsite in the forest."

## Final Rewards

- XP: 400 (roughly 30% of the 1,400 needed for level 4)
- Essence: 80
- Currency: 200 copper (2 silver display)
- Items: none
- Faction: none
- Quest flag: `trouble_in_the_wilds`

## Lore Notes

This quest establishes the goblin threat and the cave as a dangerous location. The torn journal provides narrative motivation for quest 3. Garak's completion dialogue sets up "The Goblin's Den" with the trigger phrase "cave." The abandoned campsite belonged to a trapper who fled after encountering goblins. This quest also introduces the Wilds area and the `go path` triggered passage.

## New NPCs

### Timber Rat (level 2, normal melee)
A larger, more aggressive variant of the loop rats. Brown-furred with visible scars. Roams the Hearthstead Wilds forest trails. Tougher than loop rats but still manageable for a level 2 player with basic gear.

### Forest Viper (level 2, normal melee)
A larger cousin of the garter snake, adapted to the forest undergrowth. Darker coloring with a more potent bite. Roams the Hearthstead Wilds forest trails. These provide variety but aren't a kill target in this quest; they're ambient danger and XP sources.
