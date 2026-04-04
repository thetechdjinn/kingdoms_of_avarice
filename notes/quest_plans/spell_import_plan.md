# Spell Import Plan: Levels 1-5

**Status:** Data generated, ready for import

## Files

- `import_spells_1_5.json` - 18 new spells in data import format
- `import_effects_1_5.json` - 10 new status effects in data import format

## Import Order

1. **Import status effects first** - effects must exist before spells reference them
2. **Import spells** - via spell editor or API (`POST /api/spells`)
3. **Create tome items** - one per spell, consumable with `effect_type: learn_spell` referencing the new spell ID
4. **Add tomes to vendor inventory** - assign to appropriate Hearthstead merchants

## Vendor Assignments

### Zifnab's Apprentice (mage school spells)
Currently sells: tome of magic missile, scroll of magic missile, tome of blur, tome of illuminate
Add: tome of smite (L3), tome of frost jet (L4), tome of resist cold (L4), tome of ethereal shield (L5)

### Sister Althea (priest school spells)
Currently sells: healing potion, tome of minor healing, tome of harm
Add: tome of bless (L2), tome of curse (L2), tome of turn undead (L3), tome of spiritual hammer (L4)

### Druid vendor (NEEDED - does not exist in Hearthstead)
Needs: tome of starlight (L1), tome of vine strike (L1), tome of alertness (L2), tome of mend (L2), tome of elemental chaos (L4), tome of resist fire (L5)
Options: Add to Sister Althea (she's the nature/healer NPC), or create a new vendor

### Bard vendor (NEEDED - does not exist)
Needs: tome of song of valour (L2), tome of song of discord (L3), tome of song of wisdom (L4), tome of song of brilliance (L5)
Options: Add to Zifnab's Apprentice (he's the magic NPC), or create a new vendor

## Tome Naming Convention

- Learning tomes: "tome of {spell name}" (permanent learn)
- One-use scrolls: "scroll of {spell name}" (cast once, consumed)

## Class Restrictions on Tomes

Tomes should have the same class restrictions as the spell they teach:
- Mage school: mage, gypsy, warlock (bard for mage-1 only)
- Priest school: cleric, priest, missionary, paladin
- Druid school: druid, ranger
- Bard school: bard

## Notes

- Bard gets mage-1 access in MajorMUD, so bard should be able to learn: blur, magic missile, illuminate, smite, frost jet, resist cold, ethereal shield
- Spell IDs are database-assigned, so tome `spell_id` references must be set after spell import
- The `tome of magic missle` has a typo in the name ("missle" instead of "missile") - should be fixed
