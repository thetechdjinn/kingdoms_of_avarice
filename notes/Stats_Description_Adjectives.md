# Character / Player Improvements

## The ability to look at players.

Update the look command to be able to look at other players.

When looking at a player, it should show a few times

1. Show the players name.
2. Show a description of the player. (this will be custom based on characters race, class, and stats, see below
3. Their health status as a part of their description

Example:

---

[ Frag Master ]
Frag is a gigantic, muscular Kang Ninja with no hair and black eyes. He moves
with uncanny speed, and is hostile and rather unappealing. Frag appears to be
quite stupid and seems a little naive. He is unwounded.

He is equipped with:

gold jeweled ring (Finger)
silk robe (Torso)
silk gloves (Hands)
silk trousers (Legs)
fine platinum chain (Waist)
winged sandals (Feet)
shadow cloak (Back)
ebony ninjato (Weapon Hand)

---

## Custom Descriptions

The basic description is what was provided in the Example, the only thing that changes
will be the descriptive words and they will be based on the players individual stats and
current heath (HPs)

I will break it down, In the above:

- Frag is gigantic. "Gigantic" refers to Frag's Constituion being at or over 100.
- muscular Kang Ninja with no hair and black eyes. "Muscular" means Frag's strength is between 70-79 and notes that he is a Kang (race) Ninja (class)
- He moves with uncanny speed: "Uncanny speed" is his Dexterity is between 80-89.
- and is hostile and rather unappealing: "hostile and rather unappealing" means his charm is between 30-39.
- Frag appears to be quite stupid: "quite stupid" means Frag's intellect is between 30-39.
- and seems a little naive: "seems a little naive" means Frag's wisom is between 40-49.
- He is unwounded: Means he is at full hit points.

I don't have a list of all the original values and while I can get them. It would take a good bit of time to create the characters and state them.

### Strength

- 20-29: puny
- 30-39: weak
- 40-49: slightly built
- 50-59: moderately built
- 60-69: well built
- 70-79: muscular
- 80-89: powerfully built
- 90-99: heroically proportioned
- 100-109: Herculean
- 110-120: physically Godlike

### Dexterity:

- 30-39: clumsily
- 40-49: slugishly
- 50-59: cautiously
- 60-69: gracefully
- 70-79: very swifty
- 80-89: with uncanny speed
- 90-99: with catlike agility
- 100+: blindingly fast

### Intelliect:

- 30-39: quite stupid
- 40-49: slightly dull
- 50-59: intelligent
- 60-69: bright
- 70-79: extremely cleaver
- 80-89: brilliant
- 90-99: a genius
- 100+: all-knowing

### Wisdom:

- 30-39:
- 40-49: Seems a little naive
- 50-59: looks fairly knowledgeable
- 60-69: quite experienced and wise
- 70-79: worldly air about him
- 80-89: possess a wisdom beyond his/her years
- 90-99: be in an elightened state of mind
- 100+: at one with the Gods

### Constitution:

- 30-39:
- 40-49: thin
- 50-59: healthy
- 60-69: stout
- 70-79: solid
- 80-89: massive
- 90-99: gigantic
- 100+: colossal

### Charisma:

- 30-39: hostile and rather unappealing
- 40-49: unfriendly and aloof
- 50-59: likeable in an unassuming sort of way
- 60-69: quite attractive and pleasant to be around
- 70-79: charismatic and outgoing. You can't help but like him/her
- 80-89: extremely likeable, and fairly radiates charisma
- 90-99: incredibly charismatic. You are almost overpowered by his/her strong personality.
- 100+: overwhelmingly charismatic. You almost drop to your knees in wonder at the sight of him/her.

### HPs

- 100% He is unwounded.
- 75%-99% slightly wounded.
- 50-75% moderately wounded
- 25-50% severely wounded
- 1-25% critically wounded
- 0% mortally wounded (if they drop to the ground, but aren't dead yet.)

## Update the stat command output.

I want to update the stat command to display the players stats in a better way.
While not all of the stats exist yet, they will in the future and should be displayed
as they are below.

The stat command should look like this:

```
Name: Firstname Lastname               Lives/CP:      9/0
Race: Dwarf       Exp: 3000000000      Perception:     63
Class: Priest     Level: 50            Stealth:         0
Hits:   527/527   Armour Class:   8/1  Thievery:        0
Mana:   427/427   Spellcasting: 203    Traps:           0
                                       Picklocks:       0
Strength:  110    Dexterity: 90        Tracking:        0
Intellect: 40     Health:    120       Martial Arts:   48
Willpower: 120    Charm:     70        MagicRes:      110
```

Near Armor class, the 8/1 is 8 AC and 1 damage reduction. The 1 DR means if a user gets hit for 10, he takes 9 damage.

The hits is Hit points, the first number is the current hit points and the second is the maximum hit points.

The mana is the same as hit points but for magic.

Stealth is the ability to hide or sneak.

Thievery is the ability to pickpocket.

Traps is the ability to disarm or set traps.

Picklocks is the ability to pick locks.

Tracking is the ability to track monsters or users.

Lives/CP is how many lives they have before they get rolled back to half there level. The CPs are the character points they have, but haven't spent yet.

Spellcasting is the ability to cast spells.
