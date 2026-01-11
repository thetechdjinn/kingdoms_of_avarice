# Commands Reference

[← Back to Documentation](README.md)

This document lists all available commands in Kingdoms of Avarice.

## Player Commands

### Movement

| Command     | Aliases | Description    |
| ----------- | ------- | -------------- |
| `north`     | `n`     | Move north     |
| `south`     | `s`     | Move south     |
| `east`      | `e`     | Move east      |
| `west`      | `w`     | Move west      |
| `northeast` | `ne`    | Move northeast |
| `northwest` | `nw`    | Move northwest |
| `southeast` | `se`    | Move southeast |
| `southwest` | `sw`    | Move southwest |
| `up`        | `u`     | Move up        |
| `down`      | `d`     | Move down      |

Simply type the direction to move. For example: `n` or `north` to go north.

### Information

| Command            | Aliases   | Description                  |
| ------------------ | --------- | ---------------------------- |
| `look`             | `l`       | Look around the current room |
| `look <direction>` | `l <dir>` | Peek into an adjacent room   |
| `who`              |           | See who is online            |
| `help`             | `?`       | Show available commands      |

### Settings

| Command | Description                                                                  |
| ------- | ---------------------------------------------------------------------------- |
| `brief` | Toggle brief mode on/off. When on, room descriptions are hidden when moving. |

### Communication

| Command     | Description                                                        |
| ----------- | ------------------------------------------------------------------ |
| `<message>` | Say something to players in the same room (just type your message) |

### System

| Command         | Description                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------- |
| `x`             | Exit the game. You will meditate for 10 seconds before leaving. Type any command to cancel. |
| `quit` / `exit` | Shows instructions to use `x` to leave                                                      |

## Staff Commands

These commands require Moderator role or higher.

| Command           | Description                                                          |
| ----------------- | -------------------------------------------------------------------- |
| `@goto <room_id>` | Teleport to a specific room                                          |
| `@rooms`          | List all rooms in the game                                           |
| `@roominfo [id]`  | Show detailed information about a room (current room if no ID given) |
| `@help`           | Show admin command help                                              |

## Tips

- **Brief Mode**: Use `brief` to toggle room descriptions. Useful once you know an area well.
- **Looking Around**: Use `look <direction>` to peek into adjacent rooms without moving.
- **Exiting Safely**: The `x` command gives you 10 seconds to change your mind. Any command cancels the exit.
- **Speech**: Anything you type that isn't a command is spoken aloud to others in the room.

---

[← Back to Documentation](README.md)
