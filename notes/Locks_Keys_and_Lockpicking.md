# Locks, Keys and Lockpicking

## Overview

### Locks and Lockpicking

Certain classes will have the ability to pick locks.

1. Thief
2. Rogue
3. Ninja
4. Bards

There will be a spell that can unlock a door or chest, but that will not use a player
based lock picking skill. It will use a magic to unlock the lock. That magic will use
the lock's pick difficulty to unlock the lock.

### Lockpicking

To have the lockpicking skill, the player's race or class must have the lockpicking trait.
Otherwise lockpicking will not be available to the player with the exception of a magic
spell that can unlock a door or chest.

#### Picking a Lock

To pick a lock, the player would need to have a set of lock picks and then use the command
`pick` to pick the lock. Since there can be more than one door in a room that has a lock,
the player will need to specify the direction or container they want to pick.

**Example:**

- pick north
- pick south
- pick chest

**Skill Check:**

The skill check will be a roll of the player's lockpicking skill against the lock's pick difficulty.

A lock will have a difficulty range and the player will have a lockpicking skill. If the players lockpicking skill is greater than or equal to the lock's pick upper difficulty range, the player will succeed in picking the lock 100% of the time.

If the lock's diffulty is between 25 and 90 and the player has a lockpicking skill of 55. A random roll between 25-90 will be made. If the roll is less than or equal to the player's lockpicking skill, the player will succeed in picking the lock.

If a player has a lockpicking skill of 45, but the locks difficulty range is between 55 and 90, the player will fail to pick the lock 100% of the time.

**Example:**

- Player has a lockpicking skill of 55
- Lock has a difficulty of 25 to 90
- A random roll within the lock's difficulty range will be made.
  - Random roll is 75, lockpicking attempt fails
  - Random roll is 56, lockpicking attempt fails
  - Random roll is 55, lockpicking attempt succeeds
  - Random roll is 25, lockpicking attempt succeeds

#### Calculating Lockpicking Skill

The lockpicking skill is based on having the lockpicking trait by either race or class. If the
player has a class trait, they get +1 to lockpicking skill at level 1. If they have both class
and race traits, they get +2 to lockpicking skill at level 1.

Players then get +1 to lockpicking skill per level.

Lockpicking skill is also determined by the players dexterity. For each 10 points of dexterity,
the player gets +2.5 to lockpicking skill. So a player with a 50 dexterity would have a lockpicking
skill of +12.5 added to their lockpicking skill.

Intelligence also plays a role in lockpicking. For each 10 points of intelligence,
the player gets +1 to lockpicking skill. So a player with a 50 intelligence would have a lockpicking
skill of +5 added to their lockpicking skill.

Items can have a lockpicking bonus. This bonus will be added to the player's lockpicking skill.

There also can be spells that will affect the lockpicking skill of the player. A spell can directly
affect the lockpicking skill by providing +5 to the lockpicking skill or it can indirectly affect the
lockpicking skill by providing +10 intelligence which then provides +1 to the lockpicking skill while
the spell is active.

Finally there can be permanent bonuses to lockpicking skills provided by quests or other means.

### Lockpicking Sets

Locks will have a difficulty and players will have a lockpicking skill. You will need to
have a set of lock picks to pick locks. These will need to be purchased from a theives guild
or obtained in other nefarious ways.

### Lockpicking Stats

Lockpicking sets will have different stats. These stats will be:

1. Quality
2. Durability

#### Lockpick Set Quality

The quality of a lockpicking set will provide a bonus to the locking skill of the player using it.

A quality of 1 will provide a +1 bonus to the lockpicking skill whereas a quality of 5 will provide a +5 bonus to the lockpicking skill.

#### Lockpick Set Durability

Lock picks will have a chance of breaking when used. The chance of them breaking will be based
on the durability of the lock pick.

If the lockpicker succeeds, the lockpicks will not break. Only on a lockpicking failure will the
lockpicks roll a durability check to see if they break. That durability check will be a random roll
between 1-100. A lockpicking set with a durability of 95 will have a 5% chance of breaking. A
lockpicking set with a durability of 100 will have a 1% chance of breaking. A lockpicking set with
a durability of 101 or above will have a 0% chance of breaking.

### Keys

Locked doors can have specific keys that can be used to unlock them. These keys are normal
items, but are of type key. The doors that have locks will require that the user has the
key assigned to the door to unlock the door.

A key can be assigned to any door and there can be a key that can open multiple doors. Even
a skeleton key can be created that can open any door. This key would be admin only.

Keys for a specific door open the door automatically and do not use the lock difficulty to
determine if the key can open the door.

Some keys can be consumed when used to open a door or have a random chance to be consumed.
