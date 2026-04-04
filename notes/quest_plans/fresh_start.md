# Quest: A Fresh Start

**Tag:** `fresh_start`
**Area:** Hearthstead Loop
**Target Level:** 1-3
**Steps:** 5
**Status:** Draft

## Overview

A new arrival in Hearthstead seeks work. Garak, a weathered veteran who frequents the inn, offers to help them get started. He sends the player to equip themselves at the local merchants, then to prove their mettle by clearing vermin from the trail loop surrounding the hamlet. The quest introduces core mechanics: talking to NPCs, buying from merchants, and combat.

## Prerequisites

- Min level: 1
- Max level: 3
- Required quests: none
- Required faction: none

## NPCs Involved

| NPC | Role | New/Existing | Location |
|-----|------|-------------|----------|
| Garak | Quest giver | Existing | Hearthstead Inn, Back Hall |
| Perguth | Weapons merchant | Existing | Perguth's Training Weapons |
| Geelee | Armor merchant | Existing | Geelee's Training Armor |

## Step Breakdown

### Step 1: Talk to Garak
- **Trigger:** talk
- **Target:** Garak
- **Trigger text:** "opportunities"
- **Description (journal):** Speak with {npc}Garak{/} at the {location}Hearthstead Inn{/} and ask about {yellow}opportunities{/}.
- **Completion dialogue:**
  Garak looks you over with a practiced eye. "New in town, eh? You look like you could handle yourself, but not dressed like that. Head west to {npc}Perguth{/} at {location}Perguth's Training Weapons{/}. Tell him you need {yellow}training weapons{/}. He'll set you right. If you wield magic, seek out {npc}Zifnab's Apprentice{/} or {npc}Sister Althea{/} on the main street before you head out."
- **In-progress dialogue:** (none, this is step 1)

### Step 2: Talk to Perguth
- **Trigger:** talk
- **Target:** Perguth
- **Trigger text:** "training weapons"
- **Description (journal):** Visit {npc}Perguth{/} at {location}Perguth's Training Weapons{/} and ask about {yellow}training weapons{/}.
- **Completion dialogue:**
  Perguth nods and gestures to the rack behind him. "Aye, Garak sent you? Good man. Take a look at what I've got. Type {yellow}list{/} to see my stock, then {yellow}buy{/} what suits you." He leans on the counter. "Once you're armed, go see {npc}Geelee{/} next door east for {yellow}training armor{/}. No sense heading out unprotected."
- **In-progress dialogue:**
  "Still here? Go on, type {yellow}list{/} and pick something."

### Step 3: Talk to Geelee
- **Trigger:** talk
- **Target:** Geelee
- **Trigger text:** "training armor"
- **Description (journal):** Visit {npc}Geelee{/} at {location}Geelee's Training Armor{/} and ask about {yellow}training armor{/}.
- **Completion dialogue:**
  Geelee sizes you up with a quick glance. "Perguth sent you, did he? Smart. The trail outside is crawling with rats and snakes. You'll want some padding before you tangle with them." She taps the display. "Type {yellow}list{/} and grab what you can afford. When you're geared up, head south to the {location}trail loop{/} and thin out the vermin. {npc}Garak{/} wants to see you clear out {yellow}10 rats{/} and {yellow}10 garter snakes{/}."
- **In-progress dialogue:**
  "Need more gear? Type {yellow}list{/} to see what I've got."

### Step 4: Kill 10 rats
- **Trigger:** kill
- **Target:** rat
- **Required count:** 10
- **Description (journal):** Kill 10 rats on the {location}Hearthstead Loop{/} trail.
- **Completion dialogue:** (none, automatically advances to step 5)
- **In-progress dialogue:** (Geelee) "Still got rats to clear? Keep at it."

### Step 5: Kill 10 garter snakes
- **Trigger:** kill
- **Target:** garter snake
- **Required count:** 10
- **Description (journal):** Kill 10 garter snakes on the {location}Hearthstead Loop{/} trail.
- **Completion dialogue:** (none, automatically advances to step 6)
- **In-progress dialogue:** (Geelee) "Snakes too. Don't come back until they're dealt with."

### Step 6: Report to Garak
- **Trigger:** talk
- **Target:** Garak
- **Trigger text:** "done"
- **Description (journal):** Return to {npc}Garak{/} at the {location}Hearthstead Inn{/} and tell him you're {yellow}done{/}.
- **Completion dialogue:**
  Garak grins and slides a small pouch across the table. "Well done. The farmers will sleep easier tonight." He leans back. "You've got some fight in you. When you've gained enough experience, head to the back room and talk to {npc}Toren{/} about {yellow}training{/}. He can help you grow stronger. Once you've trained up, come see me again. I may have {yellow}more work{/} for you."
- **In-progress dialogue:**
  "The trail still needs clearing. Get to it."

## Final Rewards

- XP: 150 (50% of the 300 needed for level 2)
- Essence: 60 (covers level 2 base requirement of 50, with some buffer)
- Currency: 50 copper
- Items: none
- Faction: none
- Quest flag: `fresh_start`

## Lore Notes

This is the tutorial quest. It teaches: talking to NPCs with directed speech, buying from merchants, combat basics, and the training system. Garak's final dialogue sets up the level 2 gate for "Trouble in the Wilds" and hints at the training system. The bulletin board in the inn points players to Garak initially.
