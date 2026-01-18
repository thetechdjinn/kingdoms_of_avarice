## Level Progression Structure

Characters would earn
**Character Points (CP) earned per level:**

- Levels 1-10: 10 CP per level
- Levels 11-20: 15 CP per level
- Levels 21-30: 20 CP per level
- Levels 31-40: 25 CP per level
- Levels 41-50: 30 CP per level
- Levels 51-60: 35 CP per level
- Levels 61-70: 40 CP per level
- Levels 71-80: 45 CP per level

# Stat Points Cost

​In MajorMUD, raising any stat above your race’s base value used Character Points (CP) on a sliding scale: every 10‑point band above base got more expensive per point.

## Core cost rule

For each stat (Strength, Agility, Health, Intellect, Willpower, Charm), the **per‑point** CP cost is based on how many points above your race’s base you already are. The game groups these into 10‑point ranges and increases the CP cost by 1 for each higher range.

## Cost per 10‑point band

For a given stat, measured _above your race’s base stat_ for that attribute, the cost works like this:

- Points 1–10 above base: 1 CP per point
- Points 11–20 above base: 2 CP per point
- Points 21–30 above base: 3 CP per point
- Points 31–40 above base: 4 CP per point
- Points 41–50 above base: 5 CP per point
- …and so on, with the cost per point increasing by 1 CP for each additional 10‑point band above base

There is no special breakpoint other than your race’s base value; the pattern just continues until you hit that race’s maximum for the stat.

## Example: +40 to a stat

If a race has Agility 40 base and you raise it to 80 (i.e., +40 over base), the CP cost is:

- +1 to +10 (40 → 50): 10 points × 1 CP = 10 CP
- +11 to +20 (50 → 60): 10 points × 2 CP = 20 CP
- +21 to +30 (60 → 70): 10 points × 3 CP = 30 CP
- +31 to +40 (70 → 80): 10 points × 4 CP = 40 CP

Total to go from 40 to 80 in that stat: \(10 + 20 + 30 + 40 = 100\) CP.
