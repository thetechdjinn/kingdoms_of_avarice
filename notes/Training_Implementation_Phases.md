# Implementation Phases

## Phase 1: Administrative Settings & Training Cost Formula

- Add calculateTrainingCost() with exponential scaling formula
- Add formatCurrency() for copper-to-platinum display
- Add TrainingSettings interface with caching in settingsRepository
- Seed default values: base_cost=28, multiplier=1.8, initial_cp=100

## Phase 2: Room Training Features

- Add features JSONB column to rooms table
- Add room feature helpers: getRoomFeatures, isTrainingRoom, canTrainInRoom
- Create seed "Training Hall" room connected to Town Square
- Add training config to room API responses

## Phase 3: ANSI Form System (Client-Side)

- Create FormField.ts with field types: text, number, toggle, stat, label, button
- Create AnsiForm.ts base class with keyboard navigation and rendering
- Create TrainingForm.ts with CP tracking and real-time updates
- Handle keyboard capture when form is active

## Phase 4: Training Form + Server Integration

- Add MessageType.TRAINING_FORM and TRAINING_SUBMIT
- Wire train command to show form when in training room
- Handle TRAINING_SUBMIT in socket.ts to persist stat changes
- Update client main.ts to handle form display and submission

## Phase 5: Character Creation Integration

- New characters receive training form on first WebSocket connect
- isNewCharacter flag tracks first-time players
- Training is optional - can EXIT to play with 100 unspent CP

## Phase 6: Level-Up Training

- Implement "train level" command with currency requirements
- Show cost preview and require "train level confirm" to proceed
- Award CP based on level tier (10 CP at level 1-10, 15 at 11-20, etc.)

## Phase 7: Admin Panel Integration

- Add Training tab to game-settings-editor.html
- Configure base cost, multiplier, and initial CP from admin panel
- Clear settings cache when training settings updated
