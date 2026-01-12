# Coding Guidelines

This document contains rules and best practices that must be followed when developing Kingdoms of Avarice.

## Table of Contents

1. [Text Formatting](#text-formatting)
2. [Item Naming](#item-naming)
3. [Color Usage](#color-usage)
4. [Command Output](#command-output)

---

## Text Formatting

### Word Wrapping

All long text descriptions MUST be word-wrapped properly:

- **Never split words** - Words must not be broken mid-word when wrapping
- **No leading spaces** - Wrapped lines must not start with a space
- **Default width: 80 characters** - Standard terminal width
- **Preserve line breaks** - Intentional `\r\n` breaks should be preserved

**Use the `wordWrap()` utility:**

```typescript
import { wordWrap } from "../utils/textFormat.js";

// Wrap text to 80 characters (default)
const wrapped = wordWrap(longDescription);

// Wrap to custom width
const wrapped = wordWrap(longDescription, 60);
```

### Line Endings

- Always use `\r\n` for line endings in MUD output
- Use `.join('\r\n')` when combining multiple lines

---

## Item Naming

### Single Name Field

Items use a single `name` field for display. The deprecated fields `short_desc` and `room_desc` should NOT be used for new items.

**Correct:**

```typescript
{
  name: "iron sword",
  long_desc: "A well-crafted sword made of iron. The blade is sharp and ready for battle."
}
```

**Incorrect:**

```typescript
{
  name: "Iron Sword",           // Don't use title case
  short_desc: "an iron sword",  // Deprecated - don't use
  room_desc: "An iron sword lies here."  // Deprecated - don't use
}
```

### Naming Rules

1. **Lowercase** - Item names should be lowercase (e.g., "iron sword" not "Iron Sword")
2. **No articles** - Don't include "a", "an", or "the" in the name
3. **Descriptive** - Name should clearly identify the item
4. **Keywords** - Add searchable keywords separately in the `keywords` array

### Dynamic Articles

Use the `withArticle()` function to add articles dynamically:

```typescript
import { withArticle } from "../utils/textFormat.js";

const name = "iron sword";
console.log(withArticle(name)); // "an iron sword"

const name2 = "gold coin";
console.log(withArticle(name2)); // "a gold coin"
```

The function automatically:

- Uses "an" before vowel sounds (a, e, i, o, u)
- Uses "a" before consonant sounds
- Skips if article already present

---

## Color Usage

### Standard Colors

| Color                 | Usage                         |
| --------------------- | ----------------------------- |
| `colors.cyan()`       | Room items ("You notice...")  |
| `colors.item()`       | Item names in messages        |
| `colors.boldYellow()` | Item name headers (examine)   |
| `colors.boldWhite()`  | Important values (damage, AC) |
| `colors.green()`      | Success messages, healing     |
| `colors.red()`        | Error messages, damage        |
| `colors.gold()`       | Currency values               |
| `colors.magenta()`    | Magic/enchantment effects     |

### Room Items Display

Items on the ground display in cyan as a comma-delimited list:

```
You notice iron sword, 5 gold coin, leather backpack.
```

**Format rules:**

- Prefix: "You notice "
- Items: comma-separated, lowercase
- Quantity: number prefix for stacks (e.g., "5 gold coin")
- Color: entire line in cyan

---

## Command Output

### Message Types

```typescript
MessageType.OUTPUT; // Normal output
MessageType.ERROR; // Error messages
MessageType.SYSTEM; // System notifications
```

### Response Format

All command handlers return `CommandResponse`:

```typescript
return {
  type: MessageType.OUTPUT,
  message: `You pick up ${colors.item(withArticle(itemName))}.`,
};
```

### Broadcasting

When an action is visible to others in the room:

```typescript
broadcastToRoom(
  roomId,
  `${username} picks up ${withArticle(itemName)}.`,
  excludePlayerId
);
```

---

## Code Style

### Imports

- Group imports: external packages, then internal modules
- Use `.js` extension for local imports (ESM requirement)

### Async/Await

- Always use async/await for database operations
- Handle errors appropriately

### Null Safety

- Use optional chaining (`?.`) for potentially undefined values
- Provide fallbacks with nullish coalescing (`??`)

```typescript
const name = item.template?.name ?? "something";
```
