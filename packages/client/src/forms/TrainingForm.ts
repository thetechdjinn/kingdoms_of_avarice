/**
 * Training Form - ANSI form for character stat allocation
 */

import { Terminal } from 'xterm';
import { AnsiForm, FormConfig, FormSection } from './AnsiForm.js';
import { FormField, FieldValue, FormFieldConfig } from './FormField.js';
import {
  CPStatName,
  CP_STAT_ABBREVIATIONS,
  getCPCostForNextPoint,
  HAIR_STYLES,
  HAIR_COLORS,
  EYE_COLORS,
  HairStyle,
  HairColor,
  EyeColor,
} from '@koa/shared';

export interface TrainingStat {
  current: number;
  min: number;
  max: number;
  spent: number;
}

export interface TrainingFormData {
  characterName: string;
  familyName?: string;
  race: string;
  class: string;
  level: number;
  stats: Record<CPStatName, TrainingStat>;
  unspentCp: number;
  appearance?: {
    gender?: string;
    hairStyle?: HairStyle;
    hairColor?: HairColor;
    eyeColor?: EyeColor;
  };
}

export interface TrainingFormResult {
  stats: Record<CPStatName, number>;  // Current values
  cpSpent: Record<CPStatName, number>;  // Spent per stat
  cancelled: boolean;
  familyName?: string;
  appearance?: {
    hairStyle?: HairStyle;
    hairColor?: HairColor;
    eyeColor?: EyeColor;
  };
}

export class TrainingForm extends AnsiForm {
  private formData: TrainingFormData;
  private originalUnspentCp: number;
  private onComplete: (result: TrainingFormResult) => void;

  constructor(
    terminal: Terminal,
    data: TrainingFormData,
    onComplete: (result: TrainingFormResult) => void
  ) {
    // Build config from data
    const config = TrainingForm.buildConfig(data);
    super(terminal, config);

    this.formData = data;
    this.originalUnspentCp = data.unspentCp;
    this.onComplete = onComplete;

    // Reinitialize fields with proper stat data
    this.initializeStatFields();
  }

  /**
   * Build form configuration from training data
   */
  private static buildConfig(data: TrainingFormData): FormConfig {
    const sections: FormSection[] = [];

    // Character Info Section with editable family name
    const infoFields: FormFieldConfig[] = [
      { type: 'label', name: 'given_name_label', label: 'Given Name', row: 0, col: 2 },
      { type: 'label', name: 'given_name_value', label: data.characterName, row: 0, col: 16 },
      { type: 'text', name: 'family_name', label: 'Family Name', value: data.familyName || '', row: 1, col: 16, width: 20, editable: true },
      { type: 'label', name: 'race_label', label: `Race: ${data.race}`, row: 2, col: 2 },
      { type: 'label', name: 'class_label', label: `Class: ${data.class}`, row: 2, col: 25 },
      { type: 'label', name: 'level_label', label: `Level: ${data.level}`, row: 2, col: 45 },
    ];

    sections.push({ title: 'Character', fields: infoFields });

    // Stats Section - order determines navigation order
    const statFields: FormFieldConfig[] = [];
    const stats: CPStatName[] = ['strength', 'intellect', 'wisdom', 'agility', 'constitution', 'charisma'];

    stats.forEach((stat, index) => {
      const row = Math.floor(index / 2);
      const col = (index % 2) * 35 + 2;
      const statData = data.stats[stat];

      statFields.push({
        type: 'stat',
        name: stat,
        label: CP_STAT_ABBREVIATIONS[stat],
        value: {
          current: statData.current,
          min: statData.min,
          max: statData.max,
          spent: statData.spent,
        },
        row,
        col,
        editable: true,
      });
    });

    sections.push({ title: 'Stats (Use ←→ to adjust)', fields: statFields });

    // Appearance Section
    const hairStyleOptions = [...HAIR_STYLES];
    const hairColorOptions = [...HAIR_COLORS];
    const eyeColorOptions = [...EYE_COLORS];

    const currentHairStyle = data.appearance?.hairStyle || 'none';
    const currentHairColor = data.appearance?.hairColor || 'black';
    const currentEyeColor = data.appearance?.eyeColor || 'brown';

    const appearanceFields: FormFieldConfig[] = [
      {
        type: 'toggle',
        name: 'hair_style',
        label: 'Hair Style',
        value: Math.max(0, hairStyleOptions.indexOf(currentHairStyle)),
        options: hairStyleOptions,
        row: 0,
        col: 16,
        editable: true,
      },
      {
        type: 'toggle',
        name: 'hair_color',
        label: 'Hair Color',
        value: Math.max(0, hairColorOptions.indexOf(currentHairColor)),
        options: hairColorOptions,
        row: 1,
        col: 16,
        editable: true,
      },
      {
        type: 'toggle',
        name: 'eye_color',
        label: 'Eye Color',
        value: Math.max(0, eyeColorOptions.indexOf(currentEyeColor)),
        options: eyeColorOptions,
        row: 2,
        col: 16,
        editable: true,
      },
    ];

    sections.push({ title: 'Appearance (Use Space to toggle)', fields: appearanceFields });

    // CP Display Section
    const cpFields: FormFieldConfig[] = [
      { type: 'label', name: 'cp_display', label: `Unspent CP: ${data.unspentCp}`, row: 0, col: 2 },
    ];

    sections.push({ title: 'Character Points', fields: cpFields });

    // Exit Toggle Section (SAVE or EXIT)
    const exitFields: FormFieldConfig[] = [
      {
        type: 'toggle',
        name: 'exit_toggle',
        label: 'Exit',
        value: 0,  // Default to SAVE
        options: ['SAVE', 'EXIT'],
        row: 0,
        col: 7,
        editable: true,
      },
    ];

    sections.push({ title: '', fields: exitFields });

    return {
      title: 'Character Training',
      sections,
      width: 70,
    };
  }

  /**
   * Initialize stat fields with proper CP cost tracking
   */
  private initializeStatFields(): void {
    // Update stat fields with proper value objects
    for (const field of this.fields) {
      if (field.type === 'stat') {
        const statName = field.name as CPStatName;
        const statData = this.formData.stats[statName];
        field.value = {
          current: statData.current,
          min: statData.min,
          max: statData.max,
          spent: statData.spent,
        };
        field.originalValue = { ...field.value as FieldValue };
      }
    }
  }

  /**
   * Override field change to track CP usage
   */
  protected onFieldChange(field: FormField): void {
    if (field.type === 'stat') {
      this.updateCpDisplay();
    }
  }

  /**
   * Check if we can afford to increase a stat by one point
   */
  private canAffordStatIncrease(field: FormField): boolean {
    const stat = field.value as FieldValue;
    const baseStat = this.formData.stats[field.name as CPStatName];

    // Check if already at racial max
    if (stat.current >= baseStat.max) return false;

    // Calculate current CP usage and check if we can afford the next point
    const totalCpUsed = this.calculateTotalCpUsed();
    const cpRemaining = this.originalUnspentCp - totalCpUsed;
    const costForNextPoint = getCPCostForNextPoint(stat.spent);

    return cpRemaining >= costForNextPoint;
  }

  /**
   * Check if we can decrease a stat (can't go below saved/original value)
   */
  private canDecreaseStat(field: FormField): boolean {
    const stat = field.value as FieldValue;
    const originalStat = field.originalValue as FieldValue;

    // Can only lower back to the saved value, not below
    return stat.current > originalStat.current;
  }

  /**
   * Calculate total CP used across all stats
   */
  private calculateTotalCpUsed(): number {
    let total = 0;
    for (const field of this.fields) {
      if (field.type === 'stat') {
        const stat = field.value as FieldValue;
        const original = field.originalValue as FieldValue;
        // Calculate CP cost for the points spent since form opened
        const pointsAdded = stat.spent - original.spent;
        if (pointsAdded > 0) {
          for (let i = 0; i < pointsAdded; i++) {
            total += getCPCostForNextPoint(original.spent + i);
          }
        } else if (pointsAdded < 0) {
          // Refund CP for points removed
          for (let i = 0; i < Math.abs(pointsAdded); i++) {
            total -= getCPCostForNextPoint(original.spent - i - 1);
          }
        }
      }
    }
    return total;
  }

  /**
   * Update the CP display label
   */
  private updateCpDisplay(): void {
    const cpUsed = this.calculateTotalCpUsed();
    const cpRemaining = this.originalUnspentCp - cpUsed;

    // Find and update the CP display label
    const cpField = this.fields.find(f => f.name === 'cp_display');
    if (cpField) {
      const color = cpRemaining > 0 ? '\x1b[1;32m' : (cpRemaining === 0 ? '\x1b[1;37m' : '\x1b[1;31m');
      cpField.label = `Unspent CP: ${color}${cpRemaining}\x1b[0m`;
      if (cpUsed !== 0) {
        const changeColor = cpUsed > 0 ? '\x1b[33m' : '\x1b[32m';
        cpField.label += ` ${changeColor}(${cpUsed > 0 ? '-' : '+'}${Math.abs(cpUsed)} from changes)\x1b[0m`;
      }
    }
  }

  /**
   * Override to handle training form navigation
   * Up/Down arrows adjust values, Left/Right arrows navigate between fields
   */
  protected handleKey(key: string, event: KeyboardEvent): void {
    const currentField = this.editableFields[this.selectedIndex];

    // For stat fields, handle all stat adjustment keys with CP and saved-value limits
    // This includes ArrowUp/Down and +/-/= to prevent bypassing CP enforcement
    if (currentField?.type === 'stat') {
      const isIncrease = key === 'ArrowUp' || key === '+' || key === '=';
      const isDecrease = key === 'ArrowDown' || key === '-';

      if (isIncrease || isDecrease) {
        const stat = currentField.value as FieldValue;

        if (isIncrease) {
          // Increase: check if we can afford it and not at racial max
          if (this.canAffordStatIncrease(currentField)) {
            stat.current++;
            stat.spent++;
            this.updateCpDisplay();
            this.render();
          }
        } else {
          // Decrease: can only go back to saved value, not below
          if (this.canDecreaseStat(currentField)) {
            stat.current--;
            stat.spent--;
            this.updateCpDisplay();
            this.render();
          }
        }
        return;
      }
    }

    // For toggle fields, up/down cycles options
    if (currentField?.type === 'toggle' && (key === 'ArrowUp' || key === 'ArrowDown')) {
      if (currentField.handleInput(key)) {
        this.render();
      }
      return;
    }

    // Left/right navigates between fields
    if (key === 'ArrowLeft') {
      this.movePrevious();
      return;
    }
    if (key === 'ArrowRight') {
      this.moveNext();
      return;
    }

    // Enter on the exit toggle triggers save or exit
    if (key === 'Enter' && currentField?.name === 'exit_toggle') {
      const toggleValue = currentField.options[Number(currentField.value) || 0];
      if (toggleValue === 'SAVE') {
        this.handleSave();
      } else {
        this.handleCancel();
      }
      return;
    }

    // Default handling for other keys (text input, Escape, etc.)
    super.handleKey(key, event);
  }

  /**
   * Override save to return training data
   */
  protected handleSave(): void {
    const result = this.buildResult(false);
    this.hide();
    this.onComplete(result);
  }

  /**
   * Override cancel to return unchanged data
   */
  protected handleCancel(): void {
    const result = this.buildResult(true);
    this.hide();
    this.onComplete(result);
  }

  /**
   * Build the result object
   */
  private buildResult(cancelled: boolean): TrainingFormResult {
    const stats: Record<string, number> = {};
    const cpSpent: Record<string, number> = {};
    let familyName: string | undefined;
    const appearance: TrainingFormResult['appearance'] = {};

    for (const field of this.fields) {
      if (field.type === 'stat') {
        const stat = field.value as FieldValue;
        stats[field.name] = stat.current;
        cpSpent[field.name] = stat.spent;
      } else if (field.name === 'family_name') {
        familyName = String(field.value).trim() || undefined;
      } else if (field.name === 'hair_style') {
        const index = typeof field.value === 'number' ? field.value : 0;
        appearance.hairStyle = HAIR_STYLES[index] || 'none';
      } else if (field.name === 'hair_color') {
        const index = typeof field.value === 'number' ? field.value : 0;
        appearance.hairColor = HAIR_COLORS[index] || 'black';
      } else if (field.name === 'eye_color') {
        const index = typeof field.value === 'number' ? field.value : 0;
        appearance.eyeColor = EYE_COLORS[index] || 'brown';
      }
    }

    return {
      stats: stats as Record<CPStatName, number>,
      cpSpent: cpSpent as Record<CPStatName, number>,
      cancelled,
      familyName,
      appearance,
    };
  }

  /**
   * Override render to show training-specific ANSI layout
   */
  protected render(): void {
    // Update CP tracking
    this.updateCpDisplay();

    // Clear terminal
    this.terminal.clear();

    const lines: string[] = [];
    const CYAN = '\x1b[36m';
    const WHITE = '\x1b[37m';
    const BRIGHT_WHITE = '\x1b[1;37m';
    const YELLOW = '\x1b[33m';
    const GREEN = '\x1b[32m';
    const RESET = '\x1b[0m';
    const DIM = '\x1b[2m';

    // Helper to get field by name
    const getField = (name: string) => this.fields.find(f => f.name === name);
    const isFieldSelected = (name: string): boolean => {
      const field = getField(name);
      return field !== undefined && this.editableFields[this.selectedIndex] === field;
    };

    // Calculate CP remaining
    const cpUsed = this.calculateTotalCpUsed();
    const cpRemaining = this.originalUnspentCp - cpUsed;

    // Title area with decorative border (line 1-3)
    lines.push(`${DIM} .                                     .  .${RESET}`);
    lines.push(`${CYAN}  /  Character Creation               /${RESET}    ${DIM}\\${RESET}        ${YELLOW}Point Cost Chart${RESET}`);
    lines.push(`${DIM}                                            .${RESET}`);

    // Helper to pad a string to reach a target column (accounting for visible chars only)
    const padToColumn = (str: string, visibleLen: number, targetCol: number): string => {
      const padding = Math.max(0, targetCol - visibleLen);
      return str + ' '.repeat(padding);
    };

    // Character info section (lines 4-7) - right side text starts at column 54
    const givenName = this.formData.characterName;
    const familyNameField = getField('family_name');
    const familyName = familyNameField ? String(familyNameField.value || '') : '';
    const familyNameSelected = isFieldSelected('family_name');

    // Line 4: Given Name with ___\_/ decoration
    const givenNameLeft = `     ${CYAN}Given Name${RESET}     ${BRIGHT_WHITE}${givenName.padEnd(13)}${RESET}  ${DIM}___\\_/${RESET}`;
    const givenNameVisLen = 5 + 10 + 5 + 13 + 2 + 6; // 41
    lines.push(`${padToColumn(givenNameLeft, givenNameVisLen, 53)}${DIM}1st 10 points: 1 CP each${RESET}`);

    // Line 5: Family name - editable (both states must be same width: 15 chars)
    const familyNameDisplay = familyNameSelected
      ? `${GREEN}>${RESET} ${BRIGHT_WHITE}${familyName.padEnd(12)}${RESET}${GREEN}<${RESET}`  // 1 + 1 + 12 + 1 = 15
      : `  ${WHITE}${familyName.padEnd(13)}${RESET}`;                                         // 2 + 13 = 15
    const familyNameLeft = `     ${CYAN}Family Name${RESET}  ${familyNameDisplay}`;
    // Visible length: 5 + 11 + 2 + 15 = 33
    lines.push(`${padToColumn(familyNameLeft, 5 + 11 + 2 + 15, 53)}${DIM}2nd 10 points: 2 CP each${RESET}`);

    // Line 6: Race
    const raceLeft = `     ${CYAN}Race${RESET}           ${WHITE}${this.formData.race.padEnd(13)}${RESET}`;
    lines.push(`${padToColumn(raceLeft, 5 + 4 + 11 + 13, 53)}${DIM}3rd 10 points: 3 CP each${RESET}`);

    // Line 7: Class
    const classLeft = `     ${CYAN}Class${RESET}          ${WHITE}${this.formData.class.padEnd(13)}${RESET}`;
    // Visible length: 5 + 5 + 10 + 13 = 33
    lines.push(`${padToColumn(classLeft, 5 + 5 + 10 + 13, 53)}${DIM}... and so on ...${RESET}`);
    lines.push('');

    // Stats section (lines 9-14)
    const stats: CPStatName[] = ['strength', 'intellect', 'wisdom', 'agility', 'constitution', 'charisma'];
    const statLabels: Record<string, string> = {
      strength: 'Strength',
      intellect: 'Intellect',
      wisdom: 'Wisdom',
      agility: 'Dexterity',
      constitution: 'Constitution',
      charisma: 'Charisma'
    };

    // Cost reference lines (right side) - starts at column 44
    const costLines = [
      '│        │ +10 to base stat:  10 CP',
      '│  ──────┤ +20 to base stat:  30 CP',
      '│        │ +30 to base stat:  60 CP',
      '           +40 to base stat: 100 CP',
      '           +50 to base stat: 150 CP',
      '               ... and so on ...'
    ];

    stats.forEach((stat, index) => {
      const field = getField(stat);
      const isSelected = isFieldSelected(stat);
      const statData = field?.value as { current: number; min: number; max: number; spent: number } | undefined;

      if (!statData) return;

      const label = statLabels[stat].padEnd(12);
      const minStr = String(statData.min).padStart(4);
      const maxStr = String(statData.max).padStart(4);
      const currentStr = String(statData.current).padStart(4);

      // Editable indicator - │ » is 3 chars, so use 3 spaces when not selected
      const editMarker = isSelected ? `${GREEN}│ »${RESET}` : '   ';
      const valueMarker = isSelected ? `${GREEN}«${RESET}` : `${DIM}«${RESET}`;
      const statColor = isSelected ? YELLOW : WHITE;  // Bright yellow when selected

      // Build left side: 1 + 3 + 1 + 12 + 1 + 1 + 4 + 4 + 4 + 1 + 2 + 4 + 1 + 1 = 40 visible chars
      const statLeft = ` ${editMarker} ${CYAN}${label}${RESET} (${minStr} to ${maxStr})  ${statColor}${currentStr}${RESET} ${valueMarker}`;
      const statVisLen = 1 + 3 + 1 + 12 + 1 + 1 + 4 + 4 + 4 + 1 + 2 + 4 + 1 + 1; // 40

      // Right side cost reference - pad to column 43
      const costRef = index < costLines.length ? `${DIM}${costLines[index]}${RESET}` : '';
      lines.push(`${padToColumn(statLeft, statVisLen, 43)}${costRef}`);
    });

    lines.push('');

    // Appearance section (lines 16-19)
    const hairStyleField = getField('hair_style');
    const hairColorField = getField('hair_color');
    const eyeColorField = getField('eye_color');

    const hairStyleIndex = typeof hairStyleField?.value === 'number' ? hairStyleField.value : 0;
    const hairColorIndex = typeof hairColorField?.value === 'number' ? hairColorField.value : 0;
    const eyeColorIndex = typeof eyeColorField?.value === 'number' ? eyeColorField.value : 0;

    const hairStyleValue = HAIR_STYLES[hairStyleIndex] || 'none';
    const hairColorValue = HAIR_COLORS[hairColorIndex] || 'black';
    const eyeColorValue = EYE_COLORS[eyeColorIndex] || 'brown';

    const hairStyleSelected = isFieldSelected('hair_style');
    const hairColorSelected = isFieldSelected('hair_color');
    const eyeColorSelected = isFieldSelected('eye_color');

    // Appearance fields - format: 5 leading chars + label (13 padded) + value, help text at column 53
    const renderAppearanceLine = (label: string, value: string, selected: boolean, helpText: string): string => {
      const marker = selected ? `${GREEN}│ »${RESET}` : '   ';
      const valueColor = selected ? BRIGHT_WHITE : WHITE;
      // Build left side: 1 space + marker(3) + space + label(13 padded) + value
      const leftPart = ` ${marker} ${CYAN}${label.padEnd(13)}${RESET}${valueColor}${value}${RESET}`;
      // Calculate visible length: 1 + 3 + 1 + 13 + value.length = 18 + value.length
      const visibleLen = 18 + value.length;
      // Pad to column 53, then add help text
      return `${padToColumn(leftPart, visibleLen, 53)}${DIM}${helpText}${RESET}`;
    };

    lines.push(renderAppearanceLine('Hair Length', hairStyleValue, hairStyleSelected, 'Use the arrow keys to'));
    lines.push(renderAppearanceLine('Hair Color', hairColorValue, hairColorSelected, 'toggle between choices for'));
    lines.push(renderAppearanceLine('Eye Color', eyeColorValue, eyeColorSelected, 'your physical description'));
    lines.push(`${' '.repeat(60)}${DIM}and stats${RESET}`);

    // Footer with SAVE/EXIT toggle and CP (line 20)
    const exitToggleField = getField('exit_toggle');
    const exitToggleSelected = isFieldSelected('exit_toggle');
    const exitToggleIndex = typeof exitToggleField?.value === 'number' ? exitToggleField.value : 0;
    const exitToggleValue = exitToggleField?.options[exitToggleIndex] || 'SAVE';

    // Both states must be same width: 8 chars ([ SAVE ] or   SAVE  )
    const exitDisplay = exitToggleSelected
      ? `${GREEN}[ ${exitToggleValue} ]${RESET}`   // 8 chars: [ + space + 4 + space + ]
      : `  ${WHITE}${exitToggleValue}${RESET}  `;  // 8 chars: 2 spaces + 4 + 2 spaces

    const cpColor = cpRemaining > 0 ? GREEN : (cpRemaining === 0 ? WHITE : '\x1b[31m');
    const cpDisplay = `${cpColor}${String(cpRemaining).padStart(4)}${RESET}`;

    lines.push(`      ${CYAN}Exit:${RESET} ${exitDisplay}      ${CYAN}CP Left:${RESET} ${cpDisplay}                   ${DIM}SAVE or EXIT${RESET}`);
    lines.push(`${DIM}⌐┴───────────────────────────────.     │${RESET}`);
    lines.push(`${DIM}\\_________________________________\\___/${RESET}`);

    // Write to terminal
    for (const line of lines) {
      this.terminal.write(line + '\r\n');
    }
  }

  /**
   * Get training-specific instructions
   */
  protected getInstructions(): string {
    return '\x1b[90m↑↓ Navigate  ←→ Adjust stats/toggle  Space Toggle  Enter Save/Exit  Esc Cancel\x1b[0m';
  }
}

// Export for use in main.ts
export { FormField };
export type { FieldValue };
