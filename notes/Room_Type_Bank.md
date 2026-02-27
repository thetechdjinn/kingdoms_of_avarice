# Room Type Bank

> **Status:** ✅ Implemented on branch `add_banks` — see `packages/server/src/game/bankCommands.ts`

This room type will function as a bank for players to deposit and withdraw currency from their banking account.

## Core Design

The new room type will be set using a flag making this room a special type of room for players to use as a bank.

Players will be able to deposit or withdraw currency from their banking account.

## Commands

- deposit
- withdraw
- bank

Only the deposit and withdraw commands must be used in a room flagged as a bank. The "bank" command itself is global and can be used anywhere in the game to see the players current balance in the bank.

### Command Usage:

#### Deposit

- deposit all
- deposit [amount] # in copper
- deposit [amount] [currency type] # copper, silver, gold, platinum, runic

**Example:**

- deposit 1000 # Deposit 1000 copper
- deposit 1000 silver # Deposit 1000 silver
- deposit 1000 gold # Deposit 1000 gold
- deposit 1000 platinum # Deposit 1000 platinum
- deposit 5 runic # Deposit 5 runic or whatever the runic is configured as in the settings.
- deposit all # Deposit all currency in inventory

#### Withdraw

- withdraw [amount] # in copper
- withdraw [amount] [currency type] # copper, silver, gold, platinum, runic
- withdraw all # Withdraw all currency from the bank

**Example:**

- withdraw 1000 # Withdrop 1000 copper
- withdraw 1000 silver # Withdrop 1000 silver
- withdraw 1000 gold # Withdrop 1000 gold
- withdraw 1000 platinum # Withdrop 1000 platinum
- withdraw 5 runic # Withdrop 5 runic or whatever the runic is configured as in the settings.
- withdraw all # Withdraw all currency from the bank

When withdrawing currency. Even if you specify the amount in copper, the bank should convert it to the highest possible currency type for weight efficiency.

#### Bank

Can be used anywhere in the game.

- bank # Show the players current balance in the bank

**Example:**
Type: bank
Output: On deposit: 100000000 copper farthings

The bank command should only show the players current balance in the bank, not the amount of currency they have in their inventory.
