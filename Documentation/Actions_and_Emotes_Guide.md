# Actions and Emotes Guide

[← Back to Documentation](README.md)

This guide covers the social interaction system in Kingdoms of Avarice, including pre-defined actions and custom emotes.

## Overview

Players can express themselves socially using two systems:

1. **Actions** - Pre-defined social commands stored in the database (dance, bow, wave, etc.)
2. **Emotes** - Custom freeform actions using the `/me` command

Both actions and emotes can be used even while in the "dropped" state (incapacitated), allowing roleplay to continue.

## Using Actions

Actions are simple commands that display pre-written messages to you, your target, and the room.

### Basic Usage (No Target)

Simply type the action name:

```
> dance
You dance a little jig!

(Others in the room see: "PlayerName dances a little jig!")
```

### Targeting Another Player

Add a player's name after the action:

```
> wave bob
You wave at Bob.

(Bob sees: "PlayerName waves at you.")
(Others see: "PlayerName waves at Bob.")
```

### Viewing Available Actions

Use `help actions` to see all available social actions:

```
> help actions

Social Actions:

Perform actions by typing their name. Add a player's name to target them.

  bow          - Bow respectfully
  cackle       - Cackle with glee
  cheer        - Cheer enthusiastically
  clap         - Clap your hands
  cry          - Cry tears
  dance        - Dance a jig
  ...
```

## Default Actions

The game ships with these default social actions:

| Command | Description |
| ------- | ----------- |
| `bow` | Bow respectfully |
| `cackle` | Cackle with glee |
| `cheer` | Cheer enthusiastically |
| `clap` | Clap your hands |
| `cry` | Cry tears |
| `dance` | Dance a jig |
| `grin` | Grin mischievously |
| `grovel` | Grovel pathetically |
| `hug` | Give a warm hug |
| `laugh` | Laugh out loud |
| `nod` | Nod in agreement |
| `poke` | Poke someone |
| `salute` | Salute smartly |
| `shrug` | Shrug your shoulders |
| `sigh` | Sigh heavily |
| `smirk` | Smirk knowingly |
| `wave` | Wave to others |
| `wink` | Wink playfully |
| `yawn` | Yawn sleepily |

## Using Emotes

For custom actions not covered by pre-defined commands, use the `/me` command:

```
> /me stretches and yawns
You stretches and yawns

(Others see: "PlayerName stretches and yawns")
```

Emotes display in magenta color to distinguish them from other game messages.

### Tips for Emotes

- Keep emotes in third person (what others would see)
- The game automatically prepends "You" for your view
- Example: `/me waves goodbye` shows "You waves goodbye" to you

## Action Editor (Developer)

Developers can create, edit, and manage actions using the Action Editor:

1. Access via **Developer > Action Editor** from any editor page
2. Or navigate directly to `/action-editor.html`

### Creating an Action

1. Click **+ New Action**
2. Fill in the required fields:
   - **Command**: What players type (e.g., `dance`)
   - **Description**: Brief description for help listings
   - **Self Message (No Target)**: What the actor sees (e.g., "You dance a little jig!")
   - **Room Message (No Target)**: What others see (e.g., "{player} dances a little jig!")

3. Optionally fill in targeting fields:
   - **Self Message (With Target)**: e.g., "You dance with {target}!"
   - **Target Message**: e.g., "{player} dances with you!"
   - **Room Message (With Target)**: e.g., "{player} dances with {target}!"

4. Click **Save Action**

### Placeholders

Use these placeholders in message templates:

| Placeholder | Replaced With |
| ----------- | ------------- |
| `{player}` | The actor's character name |
| `{target}` | The target's character name |

### Import/Export

- **Export**: Download all actions as JSON for backup or sharing
- **Import**: Upload a JSON file to add/update actions
  - Enable "Merge" to update existing actions by command name
  - Disable "Merge" to skip existing commands

### Hot Reload

After making changes in the editor, use the admin command to reload actions without restarting the server:

```
@reload actions
```

Or reload everything:

```
@reload all
```

## Database Schema

Actions are stored in the `actions` table:

| Column | Type | Description |
| ------ | ---- | ----------- |
| `id` | SERIAL | Primary key |
| `command` | VARCHAR(50) | Command name (unique, case-insensitive) |
| `description` | TEXT | Help text description |
| `first_person_no_target` | TEXT | Message to actor (no target) |
| `room_no_target` | TEXT | Message to room (no target) |
| `first_person_with_target` | TEXT | Message to actor (with target) |
| `target_perspective` | TEXT | Message to target |
| `room_with_target` | TEXT | Message to room (with target) |

## API Endpoints

All endpoints require Developer role or higher.

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/api/actions` | List all actions |
| GET | `/api/actions/:id` | Get single action |
| POST | `/api/actions` | Create action |
| PUT | `/api/actions/:id` | Update action |
| DELETE | `/api/actions/:id` | Delete action |
| GET | `/api/actions/export/all` | Export all actions as JSON |
| POST | `/api/actions/import` | Import actions from JSON |

---

[← Back to Documentation](README.md)
