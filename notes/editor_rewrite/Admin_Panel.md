# Admin Panel

This is the design document for the rewrite of the Admin Panel.

**Note:** Before implementation, the final layout and UI will be designed using the
frontend-design plugin and Figma (figma-remote-mcp). Screenshots and mockups will be
produced and reviewed before any code is written. This applies to all editors.

## Layout

Single-page tabbed layout, max-width 1000px centered. Three tabs: Users, IP Access,
Settings. No list/form/preview panels — each tab is its own page.

---

## Users Tab

### Pending Approval Section

Status: Good.

Shows users awaiting approval with one-click Approve button. Button disables and shows
"Approving..." during the request. User removed from list on success.

> **Claude:** Clean approval flow. No changes needed for functionality.
>
> `[PROPOSED]` Bulk approval — select multiple users and approve at once. Low priority
> unless registration volume is high.

### All Players Table

Status: **Needs pagination and search.**

Table showing: Username, Email, Max Characters (editable), Actions (Save per row).
Loads ALL players at once.

> **Claude:** No pagination, no search, no sorting. Renders every player in a single
> table. Will break at 100+ players.
>
> **Fixes needed:**
> - Add search/filter by username or email
> - Add pagination (50 per page)
> - Add sort by username, email, character count, join date
> - `[PROPOSED]` Add role display column showing current role
> - `[PROPOSED]` Add role management — dropdown to change a player's role (PLAYER,
>   MODERATOR, DEVELOPER, SYSOP, ADMIN). Currently role changes require CLI
>   (`create-admin.ts`). This is the most-requested missing feature for admin workflow.
> - `[PROPOSED]` Add last login date column to help identify inactive accounts
> - `[PROPOSED]` Add player count display at the top

---

## IP Access Tab

### Add Entry Form

Status: Good.

Fields: IP/Hostname (text), Type (IP Address / Hostname), List (Allow / Block),
Reason (optional text). Inline message feedback on add.

> **Claude:** Clean form. All fields are appropriate. Inline message feedback is good
> for form submission context.

### Current Entries Table

Status: **Needs pagination for large lists.**

Table showing: Entry, Type (badge), List (badge), Resolved IPs, Reason, Delete button.
Color-coded badges (blue=IP, purple=hostname, green=allow, red=block).

> **Claude:** The badge system is clear and well-designed. Resolved IPs display is a
> nice touch (shows what hostnames resolved to).
>
> **Fixes needed:**
> - Add pagination for large blocklists/allowlists
> - Add search/filter by entry value, type, or list type
> - `[PROPOSED]` IP test tool — input an IP and see if it would be allowed or blocked
>   under current rules. Useful for debugging access issues.
> - `[PROPOSED]` Import/export for IP lists (CSV or JSON). Useful for migrating rules
>   between environments.

---

## Settings Tab

Status: **Individual save buttons are tedious.**

8 settings, each with its own Save button and PUT request. One shared message element
at the bottom for all 8 settings.

### Current Settings

**General:**
- Max Characters Per Player (1-100) — global default character limit
- IP Access Mode (blocklist / allowlist)

**Death Mechanics:**
- Max Negative HP Percent (10-100%, default 50) — death threshold
- Dropped Tick Interval (1000-30000ms, default 5000) — bleed/recovery tick speed

**Backstab Configuration:**
- Base Min Multiplier (1.0-5.0, default 2.0)
- Base Max Multiplier (1.5-6.0, default 3.0)
- Level Bonus Min (0.0-1.0, default 0.20)
- Level Bonus Max (0.0-2.0, default 0.50)

> **Claude:** Issues:
>
> **1. Per-setting Save buttons are tedious.** Changing 3 settings means 3 separate
> clicks and 3 API calls. Group related settings with a single "Save Section" button:
> - General section: Max Characters + IP Mode → one Save
> - Death Mechanics section: Max Negative HP + Dropped Tick → one Save
> - Backstab section: all 4 backstab values → one Save
>
> **2. Shared message element is poor feedback.** All 8 saves write to one message at
> the bottom. Saving "Max Characters" overwrites feedback from saving "IP Mode" a
> moment ago. Use toast notifications (already used on other tabs) instead of the shared
> message element.
>
> **3. Settings should be in collapsible sections.** Death Mechanics and Backstab are
> already visually grouped with h3 headers but they could be collapsible accordions
> (same pattern as Room Editor's Training/Bank/Respawn sections). Keeps the page clean.
>
> **4. No description of what settings do in-context.** Each setting has a `.setting-desc`
> but some are vague. Add clearer descriptions:
> - Max Negative HP: "Player dies when HP falls below -(maxHP * this%). At 50%, a
>   player with 100 max HP dies at -50 HP."
> - Dropped Tick Interval: "Milliseconds between bleed-out damage ticks when a player
>   is in dropped state. 5000 = 1 tick per 5 seconds."
> - Backstab multipliers: "Backstab damage = weapon max damage * random(baseMin..baseMax)
>   + level * random(levelMin..levelMax)"

---

## Missing Features

> **Claude:**
>
> - `[PROPOSED]` **Role management** — most important missing feature. Change player
>   roles from the admin panel instead of requiring CLI access.
> - `[PROPOSED]` **Player search/filter/sort** — username, email, role, join date.
> - `[PROPOSED]` **Pagination** on all tables (players, IP entries).
> - `[PROPOSED]` **IP test tool** — "would this IP be allowed?"
> - `[PROPOSED]` **Server status** — show connected player count, uptime, memory usage.
>   Useful for admin dashboard.
> - `[PROPOSED]` **Audit log** — who changed which setting and when. Low priority.

## Help Section

> **Claude:** Help documentation should cover:
> - How pending approval works (new registrations require admin approval)
> - How per-player character limits work (null = use global default)
> - How IP access modes work (blocklist vs allowlist)
> - How hostname DNS resolution works (resolved every 5 minutes)
> - What each game setting does and how it affects gameplay
> - How emergency access tokens work (bypass IP restrictions)
> - How roles work (PENDING → PLAYER → MODERATOR → DEVELOPER → SYSOP → ADMIN)
