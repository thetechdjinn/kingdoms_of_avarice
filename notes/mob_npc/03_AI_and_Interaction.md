# AI and NPC Interaction

> Part of the [Mob and NPC Design Document](../Mob_and_NPC_Requirements.md)

## AI Overview

- AI will not be used for combat to start.
- AI in mobs / NPCs should only be used if there is a player in the room, otherwise it should be bypassed.
- AI for Mobs / NPCs should be a toggleable feature during the design phase of the NPC.
- Mobs have an `interactable` boolean on their template, defaulting to false for hostile mobs. Quest-related mobs can override this.

## AI Core Idea

Every AI-enabled NPC gets a "personality envelope" — a lightweight system prompt plus behavioral guardrails — and the AI generates responses within that envelope. You're not choosing from a dropdown of canned lines, but you're also not giving the AI free rein.

### Personality Envelope

Each NPC gets a config block:

- Role (merchant, quest-giver, mayor, guard, etc.)
- Knowledge scope — what this NPC knows about (their inventory, local quests, town lore). Anything outside this scope, they deflect in character ("I'm just a blacksmith, I wouldn't know about that").
- Personality traits — gruff, friendly, suspicious, verbose, terse
- Allowed actions — can this NPC trigger a trade window? Give a quest? Offer directions?
- AI toggle — on/off, with a fallback to canned responses when off

This is your system prompt, essentially. It's short, which keeps token count low and latency down.

### Keeping Latency Low

- Use a small, fast model. Haiku-class models with a tight system prompt will respond in under a second. Reserve larger models for important story NPCs.
- Cap conversation depth. Only send the last 3-5 exchanges as context. A merchant doesn't need to remember what you said 20 minutes ago.
- Pre-warm common interactions. For merchants, cache common response patterns. Skip the AI call entirely for buy/sell, only escalate to AI for unusual inputs.
- Async with a typing indicator. Show "The merchant strokes his beard thoughtfully..." while the API call resolves. A 500ms-1s delay feels natural with flavor text.

### Safety Layer (Three-Tier Approach)

- **Tier 1 — System prompt guardrails.** The personality envelope itself is your first defense. The NPC "doesn't know" about anything outside their role.
- **Tier 2 — Input keyword/pattern filter.** Before the message hits the AI, run a fast regex or keyword scan. Flag slurs, real-world references, prompt injection attempts. Flagged messages get a canned deflection and are logged.
- **Tier 3 — Strike system with auto-disable.** Track flags per player per session. After N flags (default 3) in a short window, AI disables for that player and drops to canned responses. Log for review. Optionally do a lightweight output check on the AI's response.

### Prompt Injection Protection

Never let the AI's output trigger game mechanics directly. The AI generates text. The game engine parses that text for action intents separately via skills. Even if someone tricks the NPC into saying "here, take this legendary sword for free," nothing happens mechanically unless code validates the transaction.

### Per-NPC-Type Recommendations

| NPC Type | AI Tier | Context Window | Notes |
|----------|---------|---------------|-------|
| Merchants | Lowest | Very short | Mostly template-driven for buy/sell. AI for haggling flavor and small talk. |
| Quest NPCs | Medium | Moderate | AI helps with hints, "what should I do next" in natural language. Scope limited to questline. |
| Story NPCs | Highest | Longer | Richer personality, broader world lore knowledge. May use a slightly larger model. |
| Guards / Ambient | Minimal | 1-2 exchanges | Loop back to canned lines quickly. Exist for atmosphere. |

### Architecture Summary

```
Player Input
│
▼
[Keyword Filter] ──flag──▶ [Strike Counter] ──threshold──▶ [Disable AI for player]
│ (clean)
▼
[AI Toggle Check] ──off──▶ [Canned Response]
│ (on)
▼
[Build Prompt: system envelope + last N exchanges + player input]
│
▼
[Fast Model API Call (via LiteLLM, OpenAI-compatible)]
│
▼
[Optional Output Filter]
│
▼
[Action Intent Parser (skill-based)] ──▶ [Game Engine] (validates any mechanical actions)
│
▼
[Display to Player]
```

The key insight is: the AI is the voice, not the brain of the NPC. Your game logic stays deterministic and safe. The AI just makes the dialogue feel alive.

## AI Budgets and Rate Limits

- AI should be OpenAI compatible, using LiteLLM as the adapter layer for multi-provider support.
- Costs should be configurable in a global configuration which is applied to any budgets applied to mobs and NPCs.
- AI should have overall rate and budget limits.
- Mobs and NPCs should have individual budgets and rate limits.
- Mobs and NPCs should have memory / context window limits.
  - An NPC can only remember the last X exchanges (configurable).
  - Memory exists in-memory per player-NPC pair. Cleared when player leaves the room.
  - Cleared after 5 minutes of no interaction (configurable).
  - Long-term memory is only saved via the Quest system: the player's quest journal stores quest state/progress. (Quests are a future feature.)

## Action Intents

The Action Intent Parser bridges AI dialogue and game mechanics using a **skill-based** approach. The AI generates text, the parser detects skill triggers within it, and the game engine executes validated skills.

See [Economy and Factions](05_Economy_and_Factions.md) for merchant discount mechanics tied to action intents.

## NPC Conversation Interaction

- To speak to NPCs, the player types `><npc name> <message>`
  - Example speaking to Aged Titan:
    - `>aged Hi!`
    - `>titan Hi!`
    - `>aged titan Hi!`
- If two NPCs in the same room share a keyword (e.g., two guards), the player sees a **disambiguation message** and must specify which NPC to address.
- Players can have multiple simultaneous conversations with different NPCs in the same room.
- NPCs can have conversations with many players simultaneously, each handled separately.
  - Conversation state is managed as part of the player object.
  - Conversation ends when the player leaves the room.
  - Conversation ends after 5 minutes of no interaction (configurable).

## Quest NPC Memory

- Quests use a step-based system. Each quest has sequential steps, and events are emitted to complete each step.
- Quest state is stored in a quest table per player.
- When a player talks to a quest NPC, the NPC checks the player's quest state to know which stage they are on.
- Conversation memory (last N exchanges) is separate from quest state — conversation is ephemeral, quest progress is persistent.
