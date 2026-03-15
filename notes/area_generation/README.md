# Area Generation

AI-assisted area generation for Kingdoms of Avarice. Areas are designed in markdown plan files, iterated through designer-AI conversation, then generated into importable game data.

## Documents

- [Area Generation Plan](Area_Generation_Plan.md) — Process, workflow, data format, implementation phases, and **Euclidean map creation/validation rules**

## Directory Structure

```
areas/                    # Area design plans (project root)
  _template/plan.md       # Blank template — copy to start a new area
  arindale/plan.md        # Arindale starting town (fully generated)

data/                     # Exported game data (project root, planned)
  _manifest.json          # Load order
  global/                 # Spells, effects, actions
  areas/arindale/         # Per-area JSON data files
```

## Quick Start

1. Copy `areas/_template/` to `areas/[your_area_name]/`
2. Fill in the Brief section of `plan.md`
3. Draw the ASCII map in the Layout section following format rules (see template comments and Area_Generation_Plan.md § "Creating and Validating Euclidean ASCII Maps")
4. Ask Claude to expand the proposals
5. Review, tag, iterate until approved
6. Generate game data into `data/areas/[your_area_name]/`

## ASCII Map Format (Quick Reference)

- Rooms: single char only (`*` or letter)
- Connectors: `---` (E/W), `|` (N/S), `/` (NE/SW), `\` (NW/SE)
- Room lines and connector lines alternate
- Maps must be Euclidean (loops close, no coordinate conflicts)
- See [Area Generation Plan § Euclidean Maps](Area_Generation_Plan.md#creating-and-validating-euclidean-ascii-maps) for full rules
