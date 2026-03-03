# Area Generation

AI-assisted area generation for Kingdoms of Avarice. Areas are designed in markdown plan files, iterated through designer-AI conversation, then generated into importable game data.

## Documents

- [Area Generation Plan](Area_Generation_Plan.md) — Process, workflow, data format, and implementation phases

## Directory Structure

```
areas/                    # Area design plans (project root)
  _template/plan.md       # Blank template — copy to start a new area
  silverton/plan.md       # Design docs per area
  wraithwood/plan.md

data/                     # Exported game data (project root)
  _manifest.json          # Load order
  global/                 # Spells, effects, actions
  areas/silverton/        # Per-area JSON data files
```

## Quick Start

1. Copy `areas/_template/` to `areas/[your_area_name]/`
2. Fill in the Brief section of `plan.md`
3. Ask Claude to expand the proposals
4. Review, tag, iterate until approved
5. Generate game data into `data/areas/[your_area_name]/`
