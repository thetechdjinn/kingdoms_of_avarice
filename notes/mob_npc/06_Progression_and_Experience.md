# Progression and Experience

> Part of the [Mob and NPC Design Document](../Mob_and_NPC_Requirements.md)

## Experience Distribution

- Mobs and NPCs provide experience to players.
- The XP value is set per mob/NPC template.
- Experience is shared only between players who are specifically engaged in combat with the slain mob.
- Players in the same room but engaged with a different mob do not receive experience from a mob they didn't fight.

## Level Gap Rules

Experience is equally split among eligible players unless the level difference exceeds a configurable gap (default: 5 levels). The level gap is measured against the **mob's level**, not other players.

- A level 10 player gets **no experience** for killing a level 5 mob (5+ levels above).
- A level 5 player gets **no experience** for killing a level 10 mob (5+ levels below). This is intentional — a player 5+ levels below a mob should not be able to kill it solo.

### Mixed-Level Party Formula

When a mixed-level party kills a mob and some players are outside the level range, XP is reduced proportionally. This is intentional to prevent power leveling.

- Player levels are added together, and experience is divided by total levels. Only players in range receive their percentage.
- **Example**: A level 10 and level 5 player kill a level 5 mob worth 100 XP. (10 + 5 = 15 total levels)
  - Player 10: Receives nothing (not in mob's range).
  - Player 5: (5 / 15) * 100 = 33.33% of XP.

## Group Bonus

When players are in a joined group:

- A 10% XP bonus per group member is applied, up to a maximum of +40%.
- The bonus caps at 40% regardless of group size. The 5th and 6th players receive the same 40% bonus but still divide the XP pool — this is intentional.
- **Example**: 4 players kill a mob worth 100 XP. Each gets (100 / 4) = 25 XP * 1.4 = **35 XP**.
- **Example**: 2 players kill a mob worth 100 XP. Each gets (100 / 2) = 50 XP * 1.1 = **55 XP**.

## Essence

- Mobs may provide essence (configurable per template). Not all mobs provide essence.
- Essence is **class-specific**: only players of the appropriate class receive essence from relevant kills/quests. For example, a thief receives essence from a thief-specific quest, but a warrior who helped does not receive that essence.

## Balancing

- Mob balancing and area difficulty tuning will be addressed after the core systems are built.
- A balancing tool will be designed once the final stat block structure and combat formulas are established.
