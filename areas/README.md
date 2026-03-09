# Areas

Design documents for game areas. Each area gets its own directory containing plan files that evolve through designer-AI iteration.

## Structure

```
areas/
  _template/              # Blank template — copy this to start a new area
    plan.md               # Area plan template
  arindale/               # Starting town (fully generated)
    plan.md               # Design plan (rooms, NPCs, items, quests, etc.)
  arindale_sewer/         # Sewer system beneath Arindale (in progress)
    plan.md               # Level 3-6 exploration area
  sanctum_of_the_damned/  # Forbidden cult shrine within the sewer (in progress)
    plan.md               # Separate area string for NPC containment
  warrens_of_filth/       # Rat King's territory within the sewer (in progress)
    plan.md               # First low-level quest area
  the_iridescent_menagerie/ # Mad alchemist's lab within the sewer (in progress)
    plan.md               # Introduces alchemy system
  thieves_guild/          # Hidden guild beneath the sewer (in progress)
    plan.md               # Below sewer level, accessed via "go conduit"
  [your_area]/            # Future areas follow the same pattern
    plan.md
    notes.md              # Optional freeform design notes
```

## Creating a New Area

1. Copy the `_template/` directory and rename it to your area name (lowercase, underscores)
2. Fill in the Brief section of `plan.md`
3. Ask Claude to expand the proposals
4. Review, tag, iterate until approved
5. Generate game data into `data/areas/[area_name]/`

## Plan Lifecycle

```
BRIEF → PROPOSALS → REVIEW → APPROVED → GENERATED
```

See [Area Generation Plan](../notes/area_generation/Area_Generation_Plan.md) for full process documentation.
