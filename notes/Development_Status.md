# Development Status

This document tracks the current development status and planned phases for Kingdoms of Avarice.

**Last Updated:** 2026-01-14

---

## Completed Features

### Resource Regeneration System
- **Status:** ✅ Complete
- **Commit:** a5bc90f
- Generic, data-driven regeneration for any resource (mana, health, stamina, etc.)
- Percentage-based regen of max value with configurable tick intervals
- Base and enhanced regen rates (enhanced via resting/meditating)
- Environment variable overrides for all settings
- `rest` command to enable enhanced regeneration
- `@hurt` and `@drain` admin commands for testing

**Default Configuration:**
| Resource | Tick Interval | Base % | Enhanced % |
|----------|---------------|--------|------------|
| Mana | 5000ms | 2% | 5% |
| Health | 5000ms | 1% | 3% |

### Core Infrastructure (Previously Completed)
- Room system with exits and areas
- Item system (templates, instances, equipment slots)
- Player authentication and roles
- WebSocket communication
- Progression system foundation (classes, races, talents, events)
- Room/Item/Progression editors

---

## Current Phase

### Character Creation & Stats
- **Status:** 🔄 In Progress
- **Branch:** character-creation-1

**Remaining Work:**
- Finalize primary attributes (STR, DEX, INT, CON, CHA, WIS)
- Implement class/race data-driven definitions
- Character creation flow

---

## Planned Phases

### Combat System
- **Status:** 📋 Planned
- **Reference:** `notes/Combat_Melee_Swings.md`

**Key Features:**
- Combat rounds (configurable, default 4 seconds)
- Action points/energy system for swing calculations
- Combat level (1-5) affecting speed and accuracy
- Weapon speed affecting energy consumption
- Encumbrance effects (50% baseline)
- Maximum 6 attacks per round (excess converts to crit chance)
- Hit/miss mechanics with squared ratio formula

### Spell System
- **Status:** 📋 Planned
- **Reference:** `notes/Game_Design_Plan.md`

**Key Features:**
- Spell tier system (Mage-3, Priest-3, Druid-3, etc.)
- Single-target vs AoE (room-only) spells
- Direct damage, healing, DoT, HoT, buff/debuff types
- Mana consumption
- Cooldowns
- Spell resistance and failure chance

### Experience & Essence System
- **Status:** 📋 Planned
- **Reference:** `notes/Game_Systems_Reference.md`

**Key Features:**
- Experience with configurable overlevel cap (e.g., 10% over level requirement)
- Essence as class mastery currency
- Essence spending for upgrades before leveling
- Notifications when XP/essence gain is blocked at cap
- Level-up clears essence

### Death Mechanics
- **Status:** 📋 Planned

**Key Features:**
- Configurable experience loss percentage
- Configurable essence loss
- Configurable item drops (equipped and/or inventory)
- Respawn room system

### NPC/Monster System
- **Status:** 📋 Future
- PvP combat first, then PvE
- Monster definitions, spawning, AI

---

## Technical Debt / Future Improvements

- [ ] Meditation skill to improve mana regen (replaces/augments rest)
- [ ] Buff/debuff system affecting regen rates
- [ ] Poison status blocking rest and enhanced regen
- [ ] Combat state integration with regen system
- [ ] Database persistence for regeneration configs (currently env vars only)

---

## Reference Documents

| Document | Description |
|----------|-------------|
| `notes/Game_Design_Plan.md` | High-level game design and mechanics |
| `notes/Game_Systems_Reference.md` | Technical specifications for implemented systems |
| `notes/Combat_Melee_Swings.md` | Combat and hit/miss mechanics details |
| `notes/Class_Progression_Plan.md` | Class progression planning |
| `notes/Items_Plan.md` | Item system planning |
| `CLAUDE.md` | Developer guidance for Claude Code |
