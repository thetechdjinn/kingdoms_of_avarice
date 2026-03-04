# Areas

Design documents for game areas. Each area gets its own directory containing plan files that evolve through designer-AI iteration.

## Structure

```
areas/
  _template/              # Blank template — copy this to start a new area
    plan.md               # Area plan template
  arindale/               # Starting town (fully generated)
    plan.md               # Design plan (rooms, NPCs, items, quests, etc.)
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
