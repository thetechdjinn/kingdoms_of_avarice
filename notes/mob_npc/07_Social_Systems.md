# Social Systems

> Part of the [Mob and NPC Design Document](../Mob_and_NPC_Requirements.md)

## Game Messaging Systems

The game should support multiple ways to send messages, following MajorMUD conventions for command prefixes.

### Message Types / Channels

| Channel | Color | Scope | Default | Prefix |
|---------|-------|-------|---------|--------|
| Gossip | Magenta | Global | On | `gos` / `gossip` |
| Auction | Yellow | Global | On | `auc` / `auction` |
| Broadcast | Yellow | Global (joined) | Off (must join) | `br` / `broadcast` |
| Telepath | Magenta | Player-to-player | On | `tel` / `telepath` |
| Shout | — | Room + adjacent | Always on | `yel` / `shout` |
| Gang Path | Brown | Guild-wide | — | Future feature |
| Group Chat | Yellow | Group members | On (if grouped) | `gr` / `group` |

### Gossip

- Default color: magenta. Defaults to "on."
- Toggle: `gossip on` / `gossip off`
- Send: `gos <message>` or `gossip <message>`
- Display: `<player name> gossips: <message>`

### Auction

- Identical to gossip but in yellow and used for buying/selling items between players.
- Uses "auction" in display text.

### Broadcast

- Player-created channels. Must join to receive messages.
- Can be password protected.
- Broadcast channels have a text ID.
- Channels auto-delete if all users leave the channel / game.
- Commands:
  - Create: `broadcast create <channel name>` (optional: `<password>`)
  - Join: `join br <channel name>` (optional: `<password>`)
  - Leave: `leave <channel name>`
  - List members: `br` or `broadcast` with no message
- No password required to join if none was set on creation.

### Telepath

- Player-to-player direct messages.
- Send: `tel <player name> <message>`
- Display (sender): `You telepath <player name>: <message>`
- Display (receiver): `<player name> telepaths you: <message>`
- Toggle: `tel on` / `tel off`
- Block: `/block <player name>` / `/unblock <player name>`
- Color: magenta.

### Shout

- Heard in current room and all adjacent rooms.
- Send: `yel <message>` or `shout <message>`
- Same room: `<player name> shouts: <message>`
- Adjacent room: `You hear <player name> shout from the <direction>: <message>`
  - Direction is from the **listener's perspective** (e.g., if the shouter is to the north, the listener hears "from the north").

### Gang Path (Future Feature)

- Gangs are a future enhancement.
- Gang Paths are inter-guild communication.
- All members of your guild can talk and hear gang paths.
- Color: brown.

### Group Chat

- Group members can communicate even if separated. Only group members can hear.
- Color: yellow.
- Send: `group <message>` or `gr <message>`
- Display: `<player name> group chats: <message>`
- Status: `gr` or `group` with no message lists group members with health and mana:
  ```
  Group Members:
    Player_1 Health [80%] Mana 100%
    Player_2 Health 100%
    Player_3 Health 10% Mana 30%
  ```

## Group Party System

### Requirements

- Players must be in the same room to form a group.
- The group leader is the player who invites.
- The leader must **invite first** — players cannot join uninvited.
- Invited players receive a notification and must `join` to accept.

### Commands

| Command | Who | Description |
|---------|-----|-------------|
| `invite <player>` | Leader | Invite a player to the group |
| `join <leader>` | Invited player | Accept the invitation |
| `kick <player>` | Leader | Remove a player from the group |
| `leave` | Any member | Leave the group |

### Rules

- If the leader leaves or disconnects, **the first member to have joined becomes the new leader** (no disband).
- If a follower leaves, the group continues without them.
- Maximum group size: **6 players**.
- No group loot rules initially. All loot is free-for-all on the ground.
- Rolling for loot may be added as a future feature.
- Group XP bonus: +10% per member, max +40%. See [Progression and Experience](06_Progression_and_Experience.md).
- Group member list is only visible via the `gr` / `group` command (no persistent UI indicator).

### Command Disambiguation

- `join br <name>` — join a broadcast channel
- `join <player name>` — join a group (requires prior invite)
