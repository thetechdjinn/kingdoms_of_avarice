---
name: code-review
description: Code review a pull request against Kingdoms of Avarice project conventions
allowed-tools: Agent, Bash(gh issue view:*), Bash(gh search:*), Bash(gh issue list:*), Bash(gh pr comment:*), Bash(gh pr diff:*), Bash(gh pr view:*), Bash(gh pr list:*), Bash(git log:*), Bash(git diff:*), Bash(git blame:*), Bash(git show:*), Bash(npm audit:*), Read, Grep, Glob
disable-model-invocation: false
---

# Kingdoms of Avarice - Code Review

You are reviewing a pull request for **Kingdoms of Avarice**, a web-based MUD (Multi-User Dungeon). This is a TypeScript monorepo with real-time WebSocket communication and a terminal-style xterm.js interface.

## Input

$ARGUMENTS

If the argument is a PR number or URL, use it. If no argument, detect the current branch and find its open PR with `gh pr view`.

## Excluded Paths

**Skip these entirely** unless the user explicitly asks to review them. Do not flag changes in:
- `data/` (exported JSON game data)
- `packages/server/src/db/arindale/` (city seed data)
- `packages/server/src/db/sewer/` (sewer seed data)
- `packages/server/src/db/warrens/` (warrens seed data)
- `packages/server/src/db/menagerie/` (menagerie seed data)
- `packages/server/src/db/sanctum/` (sanctum seed data)
- `packages/server/src/db/seed_*.sql` (SQL seed files)

Game data values change frequently during balancing. Treating data value changes as issues creates noise.

## Reviewed But Not Code-Checked Paths

These paths are **not excluded** from review but are reviewed differently:
- `notes/` (design plans, system guides)
- `Documentation/` (player/developer documentation)
- `docs/` (additional documentation)
- `areas/` (area plan files with ASCII maps)

These files describe how systems work. They should stay in sync with the code. See Agent 6 below.

## Review Process

### Step 1: Pre-flight Check

Run `gh pr view <number> --json state,isDraft,additions,deletions,title` to verify:
- PR is not closed or merged
- PR is not a draft (if draft, note it and ask the user if they still want a review)
- If the PR has 0 additions and 0 deletions, skip the review

If ineligible, tell the user why and stop.

### Step 2: Gather Context

1. Get the PR diff: `gh pr diff <number>`
2. Get the PR description: `gh pr view <number>`
3. Check for existing review comments: `gh pr view <number> --json comments`
4. Identify all changed files, filtering out excluded paths
5. Read CLAUDE.md from the repo root for the full convention reference

### Step 3: Launch Parallel Review Agents

Launch these review agents in parallel. Each agent reviews the full diff independently from its own perspective. Each agent should also read the surrounding code context (not just the diff) to understand intent.

**Important for all agents**: Only flag issues **introduced or modified by this PR**. Use `git blame` when uncertain whether an issue is pre-existing. Do not flag pre-existing problems unless they are severe security issues.

#### Agent 1: Project Convention Compliance

Review all changed code for violations of these project-specific rules:

**Text Output Rules:**
- MUD output must use `\r\n` for line endings, not `\n`
- Text should be word-wrapped to 80 characters using `wordWrap()` from `utils/textFormat.js`
- Use `.join('\r\n')` when combining output lines
- **Never use em dashes** (the `\u2014` character) **in player-visible text** (room descriptions, item descriptions, NPC dialogue, system messages). Use periods, commas, colons, or semicolons instead. Em dashes in code comments are fine.

**Item Display Rules:**
- Item names must be lowercase with no articles: `"iron sword"` not `"Iron Sword"` or `"an iron sword"`
- Use `withArticle(name)` when displaying items to players
- **Never show numeric amounts** for consumable healing/mana/damage in player-visible text. Use flavor text only (e.g., `"You feel better!"` not `"You feel better! (+25 HP)"`). Spells and admin commands may show amounts.
- **Never show weight or value** when a player examines an item

**NPC Name Display:**
- Use the NPC name helper functions from `textFormat.ts`: `withNpcName()` (object position), `withNpcNameCapitalized()` (subject/sentence start), `withNpcNameThe()` (definite article), `withNpcNamePossessive()` (possessive form)
- NPCs with `properName: true` skip "the" prefixing (e.g., "Goran" not "the Goran")
- Players always have `isProperName: true`

**Color Function Usage:**
- `colors.cyan()` for room items ("You notice...")
- `colors.item()` for item names in messages
- `colors.green()` for success and healing
- `colors.red()` for errors and damage
- `colors.gold()` for currency

**Import Rules:**
- Local imports must use `.js` extension (ESM requirement)
- Group imports: external packages first, then internal modules

**Command Handlers:**
- Must return `CommandResponse` objects with `type` and `message`
- Use `broadcastToRoom()` for room-visible actions

**UI Rules (Client-side):**
- **Never use native JavaScript dialogs** (`alert()`, `confirm()`, `prompt()`). Use `showConfirm`/`showPrompt`/`showToast` from `components/modal.ts`

**Navigation:**
- All editor/admin pages must use `renderNav()` from `packages/client/src/components/nav.ts`

For each violation found, report the file, line, the rule violated, and a brief explanation.

#### Agent 2: Bug Detection & Logic Errors

Focus on finding actual bugs and logic errors in the changed code. Read surrounding context to understand the intent before flagging.

Look for:
- Off-by-one errors, null/undefined access, missing awaits on async calls
- Race conditions in WebSocket handlers or database operations
- Missing `withTransaction()` for multi-step database operations that need atomicity
- Incorrect entity type checks (missing `isPlayerEntity()` guards where players and NPCs diverge)
- Combat system errors: incorrect damage calculations, missing combat state cleanup via `clearCombatState()`
- NPC system: missing respawn scheduling, stale instance references after despawn
- Database: SQL errors, missing parameterized queries, unclosed transactions
- WebSocket: missing message type handling, broadcasting to disconnected sockets
- State management: in-memory state (haggle reps, groups, broadcast channels, hostility timers) not cleaned up on player disconnect
- Async error handling: unhandled promise rejections in command handlers or route handlers

**Input Validation & Type Safety:**

Every value that crosses a trust boundary must be validated before use. Trust boundaries include: user commands, HTTP request bodies/params/query, WebSocket messages, database query results, JSON file imports (including seed data and game data), and external API responses.

Check for:
- **Numeric inputs**: `parseInt()`/`Number()` results used without checking `isNaN()` or `isFinite()`. Player commands like `@exp 100 bob` must validate the amount is a valid positive number before passing it to game logic.
- **Null/undefined after lookups**: `.get()`, `.find()`, `Map.get()`, array index access, and repository query results used without null checks. If a lookup can miss, the code must handle the miss.
- **Type coercion**: String values from `req.query`, `req.params`, or command args used as numbers without explicit conversion and validation. A `req.params.id` is always a string, even if it looks like a number.
- **Array bounds**: Index access on arrays without length checks, especially with user-provided indices.
- **Enum/union validation**: String values compared against expected sets (e.g., `role`, `stealthMode`, `triggerType`) must reject unexpected values rather than falling through silently.
- **Object shape validation**: `req.body` fields assumed to exist or be the correct type. New REST endpoints should validate required fields are present and are the expected type before using them.
- **Seed data and game data imports**: Data loaded from JSON files (`data/` directory, `data-import.ts`) or seed scripts must validate field types and required fields before inserting into the database. Missing fields should produce clear error messages, not silent `undefined` inserts or runtime crashes. Check that import functions validate: required fields exist, numeric fields are numbers, arrays are arrays, enum fields contain valid values, and foreign key references resolve correctly.
- **Database row mapping**: Repository `dbToTemplate`/`dbToX` functions that map raw query rows to typed objects should use fallback defaults (`??`) that match the database column defaults, and should not silently swallow unexpected nulls for required fields.

Do NOT flag:
- Style preferences or minor naming choices
- Missing error handling for states that cannot actually occur
- Hypothetical edge cases with no realistic trigger path
- Pre-existing issues not touched by this PR

#### Agent 3: Security Review

Review for security vulnerabilities relevant to a web-based game:

- **SQL injection**: Raw SQL with string interpolation instead of parameterized queries (`$1`, `$2` placeholders)
- **XSS**: User input rendered without sanitization in xterm.js output or editor HTML pages
- **Command injection**: User input passed to shell commands, `eval()`, `new Function()`, or template literal execution
- **Auth/authz bypass**: Missing role checks (`requireAdmin`, `requireDeveloper`, `requireModerator`) on new routes, missing JWT validation
- **WebSocket security**: Missing authentication on socket connections, accepting commands without validating the player owns the referenced character
- **Path traversal**: File operations with user-controlled paths
- **Mass assignment**: Accepting arbitrary fields from `req.body` directly into database queries without whitelisting
- **Information disclosure**: Leaking internal database IDs, stack traces, or system paths to players via error messages
- **Privilege escalation**: Player commands that can affect other players without proper authorization

Do NOT flag:
- CSRF on API routes (handled by httpOnly cookies + same-origin policy)
- Rate limiting (out of scope)
- Dependency vulnerabilities (checked by Agent 7 and Dependabot)

#### Agent 4: Architecture & Pattern Compliance

Review for adherence to the project's architectural patterns:

- **Repository pattern**: Database access should go through repository files in `packages/server/src/db/repositories/`, not direct SQL in command handlers or route files
- **Shared types**: New types/enums shared between client and server belong in `packages/shared/src/`, not duplicated across packages
- **CombatEntity interface**: Combat code should use the `CombatEntity` abstraction from `combatEntity.ts`, not assume players only. Use `isPlayerEntity()` to gate player-specific behavior.
- **NPC ID offset**: NPC IDs use `NPC_ID_OFFSET = 1_000_000` to separate from player IDs
- **Message types**: Use `MessageType` enum values from `@koa/shared` for WebSocket messages
- **Route organization**: REST endpoints follow existing patterns in `packages/server/src/routes/`
- **Editor patterns**: New editors should follow the three-panel layout (list, form, preview) established by existing editors

Also check:
- Are new shared types exported properly from `packages/shared`?
- Do new database migrations have proper column types and constraints?
- Are new REST routes properly gated with role middleware?
- Do new game commands register in the command processor (`commands.ts` or the appropriate command file)?
- Is `@reload` support added for any new cached data types?

#### Agent 5: Room & Spatial Consistency (conditional)

**Only run this agent if the PR modifies room data, exits, or area seed files.**

If applicable, verify:
- Room exits are geographically consistent (east-then-south must reach the same room as south-then-east)
- Room descriptions match their exit directions (don't describe "a stairway leads north" if the exit is `down`)
- **Corner rule**: No two buildings at the (1,1) corner of the same intersection
- **Block boundary rule**: Building chains of 4+ rooms fit within the 3-position block interior between streets
- New area seeds match their ASCII map in `areas/<area_name>/plan.md` exactly (room count, connections, labeled room types)
- Non-Euclidean areas (organic/natural areas that intentionally break grid consistency) are explicitly marked as such in the source

#### Agent 6: Documentation & Plan Sync

Check whether documentation, design plans, and notes are in sync with the code changes in this PR. This agent reviews in **both directions**:

**Direction 1 — Code changed, docs/plans not updated:**
- If the PR changes game mechanics, commands, progression, combat, quests, or other systems: check whether corresponding files in `notes/`, `Documentation/`, or `CLAUDE.md` describe the old behavior and need updating.
- Read the relevant doc/plan files and compare against the new code behavior.
- Flag when a document describes behavior that the code no longer implements.

**Direction 2 — Docs/plans changed, code not matching:**
- If the PR modifies files in `notes/` or `Documentation/`: read the updated content and verify the code actually implements what the document now describes.
- Flag when a plan or guide describes features or behaviors not present in the code.

**What to check:**
- `notes/` files are design plans and system guides. They should accurately reflect what the code does.
- `Documentation/` and `docs/` files are player or developer-facing docs. They should match current commands, mechanics, and workflows.
- `areas/*.plan.md` files contain ASCII maps. If area seed data changed, the map should match.
- `CLAUDE.md` contains command references, architecture notes, and conventions. New commands or changed behaviors should be reflected there.

**What NOT to flag:**
- Minor wording differences that don't affect accuracy
- Plans that describe future/unimplemented phases (these are roadmaps, not specifications for current code)
- Documentation style preferences

For each sync issue found, report: which file is stale, what specifically is out of date, and what the code now does instead.

#### Agent 7: Dependency Audit

Run `npm audit --json` and report any vulnerabilities found in project dependencies.

**What to report:**
- Vulnerabilities with severity **high** or **critical** — these go in the Critical section
- Vulnerabilities with severity **moderate** — these go in the Suggestions section
- For each vulnerability: package name, severity, title/description, and whether a fix is available (`npm audit fix` or a manual version bump)
- If `npm audit` reports 0 vulnerabilities, do not include this section in the output

**What NOT to report:**
- **Low** severity vulnerabilities (too noisy for PR reviews)
- Vulnerabilities in devDependencies that cannot be exploited at runtime

**How to run:**
```bash
npm audit --json 2>/dev/null
```

Parse the JSON output. Group by severity. For fixable vulnerabilities, note the fix command.

### Step 4: Confidence Scoring

For each issue found by any agent, assign a confidence score from 0-100:

- **90-100**: Definite issue. Clear rule violation, obvious bug, or confirmed security flaw.
- **70-89**: Likely issue. Strong evidence but some ambiguity about intent.
- **50-69**: Possible issue. Worth mentioning but could be intentional.
- **Below 50**: Probably not an issue. Discard silently.

**Only include issues scoring 70 or above in the final output.**

### Step 5: Deduplicate and Prioritize

Before formatting the output:
- Remove duplicate findings across agents (keep the most specific version)
- If the same root cause produces multiple symptoms, report the root cause once
- Limit to the 15 most important findings. If there are more, mention "N additional minor issues not listed"

### Step 6: Format and Post Review

Format the review as a GitHub PR comment using `gh pr comment <number> --body "..."`:

```
## Code Review

**Summary**: One sentence describing the overall quality and what the PR does.

### Critical
Issues that must be fixed before merge (bugs, security vulnerabilities, data loss risks).
- **[file:line]** Description of issue

### Conventions
Project convention violations that should be fixed.
- **[file:line]** Description of violation and which convention it breaks

### Suggestions
Non-blocking improvements worth considering.
- **[file:line]** Description of suggestion

---
*Automated review for Kingdoms of Avarice by Claude Code*
```

Rules for the final output:
- Be specific: reference exact file paths and line numbers
- Be actionable: explain what's wrong AND how to fix it
- Be concise: one clear sentence per issue, not paragraphs
- Omit empty severity sections entirely
- If no issues found, post a short positive comment: "Looks good. No issues found." Don't pad with filler.
- Post the comment using `gh pr comment <number> --body "$(cat <<'EOF' ... EOF)"`
