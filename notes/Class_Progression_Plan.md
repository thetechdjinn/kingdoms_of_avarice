# Revised Plan: Mastery Exchange & Progression System (MEPS)

## 1. Core Concept

Players manage two resources: **Standard XP** (Linear growth) and **Essence** (Class-specific currency). Leveling up requires a threshold of both, but Essence can also be spent on horizontal power (Skills/Talents).

## 2. Updated Development Phases

### Phase 1: The Dual-Track Foundation

- Implement `Standard_XP` (Value) and `Essence_Pool` (Currency).
- Define the `Level_Gate`: Level Up occurs ONLY when `Total_Essence_Earned_This_Level >= Requirement`.
- **UI Hook:** Create a "Mastery Gauge" that clearly shows the Essence gap.

### Phase 2: The Throttling & Diminishing Returns (Anti-Script)

- Build the `ActivityTracker`.
- **Logic:** Each `Essence_Event_ID` has a `Yield_Curve`.
  - First 1-20 completions: 100% Yield.
  - 21-50 completions: 50% Yield.
  - 50+: 10% Yield.
- **Reset Trigger:** Yield curves reset upon Level Up or reaching a new World Region.

### Phase 3: Class-Agnostic Event Bus

- Create the `EventBroadcaster`.
- Establish "Thematic Tags" (e.g., #Melee, #Arcane, #Stealth, #Holy).
- **Mapping:** Classes are assigned tags they can "harvest" Essence from. (e.g., A Paladin harvests from #Melee and #Holy).

### Phase 4: The Essence Economy (The "Sink")

- Implement a "Talent Tree" or "Skill Shop" where `Current_Essence` is the currency.
- **Balance:** Spending Essence does NOT lower your `Total_Essence_Earned_This_Level` (the level gate), but it does mean you have to earn more if you want to buy the next skill AND level up.

---

## 3. Class Performance Example (Post-Review)

| Activity            | Warrior (1.0x)   | Paladin (2.2x)     | Note                                   |
| :------------------ | :--------------- | :----------------- | :------------------------------------- |
| **Kill Monster**    | 100 Std / 5 Ess  | 100 Std / 5 Ess    | The "Passive Trickle"                  |
| **Class Quest**     | 500 Std / 50 Ess | 500 Std / 150 Ess  | Paladin gets more Ess for harder tasks |
| **Specific Action** | (N/A)            | 20 Ess (Heal Ally) | Only triggers for valid Tags           |

## 4. Key Improvements over Initial Draft

- **Horizontal Progression:** Essence is now a choice, not just a grind.
- **Regional Incentives:** Diminishing returns reset when moving from "Starter Town" to "Frontier Town," forcing world exploration.
- **Visual Feedback:** The UI now prioritizes the "Level Up Readiness" state over raw numbers.
