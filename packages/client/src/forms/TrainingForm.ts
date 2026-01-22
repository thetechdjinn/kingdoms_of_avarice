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

// ANSI color constants
const ANSI = {
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',
  BRIGHT_WHITE: '\x1b[1;37m',
  YELLOW: '\x1b[33m',
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  RESET: '\x1b[0m',
  DIM: '\x1b[2m',
} as const;

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
   * Override field change to track and validate CP usage
   */
  protected onFieldChange(field: FormField): void {
    if (field.type === 'stat') {
      // Validate CP - revert if over budget or below saved value
      const stat = field.value as FieldValue;
      const original = field.originalValue as FieldValue;
      const totalCpUsed = this.calculateTotalCpUsed();
      const cpRemaining = this.originalUnspentCp - totalCpUsed;

      // Revert if CP is negative (over budget)
      if (cpRemaining < 0) {
        stat.current = original.current;
        stat.spent = original.spent;
      }
      // Revert if below saved value
      if (stat.current < original.current) {
        stat.current = original.current;
        stat.spent = original.spent;
      }

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

    // Ignore Escape key - must use SAVE/EXIT toggle to leave the form
    if (key === 'Escape') {
      return;
    }

    // Default handling for other keys (text input, etc.)
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
    this.updateCpDisplay();
    this.terminal.clear();

    const lines: string[] = [
      ...this.renderTitleSection(),
      ...this.renderCharacterInfoSection(),
      '',
      ...this.renderStatsSection(),
      '',
      ...this.renderAppearanceSection(),
      ...this.renderFooterSection(),
    ];

    for (const line of lines) {
      this.terminal.write(line + '\r\n');
    }
  }

  /** Render title area with decorative border */
  private renderTitleSection(): string[] {
    return [
      `${ANSI.DIM} .                                     .  .${ANSI.RESET}`,
      `${ANSI.CYAN}  /  Character Creation               /${ANSI.RESET}    ${ANSI.DIM}\\${ANSI.RESET}        ${ANSI.YELLOW}Point Cost Chart${ANSI.RESET}`,
      `${ANSI.DIM}                                            .${ANSI.RESET}`,
    ];
  }

  /** Render character info section (name, race, class) */
  private renderCharacterInfoSection(): string[] {
    const lines: string[] = [];
    const familyNameField = this.fields.find(f => f.name === 'family_name');
    const familyName = familyNameField ? String(familyNameField.value || '') : '';
    const familyNameSelected = this.editableFields[this.selectedIndex] === familyNameField;

    // Given Name with decoration
    const givenNameLeft = `     ${ANSI.CYAN}Given Name${ANSI.RESET}     ${ANSI.BRIGHT_WHITE}${this.formData.characterName.padEnd(13)}${ANSI.RESET}  ${ANSI.DIM}___\\_/${ANSI.RESET}`;
    lines.push(`${this.padToColumn(givenNameLeft, 53)}${ANSI.DIM}1st 10 points: 1 CP each${ANSI.RESET}`);

    // Family name - editable (both states same width: 15 chars)
    const familyNameDisplay = familyNameSelected
      ? `${ANSI.GREEN}>${ANSI.RESET} ${ANSI.BRIGHT_WHITE}${familyName.padEnd(12)}${ANSI.RESET}${ANSI.GREEN}<${ANSI.RESET}`
      : `  ${ANSI.WHITE}${familyName.padEnd(13)}${ANSI.RESET}`;
    const familyNameLeft = `     ${ANSI.CYAN}Family Name${ANSI.RESET}  ${familyNameDisplay}`;
    lines.push(`${this.padToColumn(familyNameLeft, 53)}${ANSI.DIM}2nd 10 points: 2 CP each${ANSI.RESET}`);

    // Race
    const raceLeft = `     ${ANSI.CYAN}Race${ANSI.RESET}           ${ANSI.WHITE}${this.formData.race.padEnd(13)}${ANSI.RESET}`;
    lines.push(`${this.padToColumn(raceLeft, 53)}${ANSI.DIM}3rd 10 points: 3 CP each${ANSI.RESET}`);

    // Class
    const classLeft = `     ${ANSI.CYAN}Class${ANSI.RESET}          ${ANSI.WHITE}${this.formData.class.padEnd(13)}${ANSI.RESET}`;
    lines.push(`${this.padToColumn(classLeft, 53)}${ANSI.DIM}... and so on ...${ANSI.RESET}`);

    return lines;
  }

  /** Render stats section with CP cost chart */
  private renderStatsSection(): string[] {
    const lines: string[] = [];
    const stats: CPStatName[] = ['strength', 'intellect', 'wisdom', 'agility', 'constitution', 'charisma'];
    const statLabels: Record<string, string> = {
      strength: 'Strength', intellect: 'Intellect', wisdom: 'Wisdom',
      agility: 'Dexterity', constitution: 'Constitution', charisma: 'Charisma'
    };
    const costLines = [
      '│        │ +10 to base stat:  10 CP',
      '│  ──────┤ +20 to base stat:  30 CP',
      '│        │ +30 to base stat:  60 CP',
      '           +40 to base stat: 100 CP',
      '           +50 to base stat: 150 CP',
      '               ... and so on ...'
    ];

    stats.forEach((stat, index) => {
      const field = this.fields.find(f => f.name === stat);
      const isSelected = this.editableFields[this.selectedIndex] === field;
      const statData = field?.value as { current: number; min: number; max: number; spent: number } | undefined;
      if (!statData) return;

      const label = statLabels[stat].padEnd(12);
      const minStr = String(statData.min).padStart(4);
      const maxStr = String(statData.max).padStart(4);
      const currentStr = String(statData.current).padStart(4);
      const editMarker = isSelected ? `${ANSI.GREEN}│ »${ANSI.RESET}` : '   ';
      const valueMarker = isSelected ? `${ANSI.GREEN}«${ANSI.RESET}` : `${ANSI.DIM}«${ANSI.RESET}`;
      const statColor = isSelected ? ANSI.YELLOW : ANSI.WHITE;

      const statLeft = ` ${editMarker} ${ANSI.CYAN}${label}${ANSI.RESET} (${minStr} to ${maxStr})  ${statColor}${currentStr}${ANSI.RESET} ${valueMarker}`;
      const costRef = index < costLines.length ? `${ANSI.DIM}${costLines[index]}${ANSI.RESET}` : '';
      lines.push(`${this.padToColumn(statLeft, 43)}${costRef}`);
    });

    return lines;
  }

  /** Render appearance section (hair, eye color) */
  private renderAppearanceSection(): string[] {
    const lines: string[] = [];
    const hairStyleField = this.fields.find(f => f.name === 'hair_style');
    const hairColorField = this.fields.find(f => f.name === 'hair_color');
    const eyeColorField = this.fields.find(f => f.name === 'eye_color');

    const hairStyleIndex = typeof hairStyleField?.value === 'number' ? hairStyleField.value : 0;
    const hairColorIndex = typeof hairColorField?.value === 'number' ? hairColorField.value : 0;
    const eyeColorIndex = typeof eyeColorField?.value === 'number' ? eyeColorField.value : 0;

    const renderLine = (label: string, value: string, field: FormField | undefined, helpText: string): string => {
      const selected = this.editableFields[this.selectedIndex] === field;
      const marker = selected ? `${ANSI.GREEN}│ »${ANSI.RESET}` : '   ';
      const valueColor = selected ? ANSI.BRIGHT_WHITE : ANSI.WHITE;
      const leftPart = ` ${marker} ${ANSI.CYAN}${label.padEnd(13)}${ANSI.RESET}${valueColor}${value}${ANSI.RESET}`;
      return `${this.padToColumn(leftPart, 53)}${ANSI.DIM}${helpText}${ANSI.RESET}`;
    };

    lines.push(renderLine('Hair Style', HAIR_STYLES[hairStyleIndex] || 'none', hairStyleField, 'Use the arrow keys to'));
    lines.push(renderLine('Hair Color', HAIR_COLORS[hairColorIndex] || 'black', hairColorField, 'toggle between choices for'));
    lines.push(renderLine('Eye Color', EYE_COLORS[eyeColorIndex] || 'brown', eyeColorField, 'your physical description'));
    lines.push(`${' '.repeat(60)}${ANSI.DIM}and stats${ANSI.RESET}`);

    return lines;
  }

  /** Render footer with save/exit toggle and CP display */
  private renderFooterSection(): string[] {
    const exitToggleField = this.fields.find(f => f.name === 'exit_toggle');
    const exitToggleSelected = this.editableFields[this.selectedIndex] === exitToggleField;
    const exitToggleIndex = typeof exitToggleField?.value === 'number' ? exitToggleField.value : 0;
    const exitToggleValue = exitToggleField?.options[exitToggleIndex] || 'SAVE';

    const exitDisplay = exitToggleSelected
      ? `${ANSI.GREEN}[ ${exitToggleValue} ]${ANSI.RESET}`
      : `  ${ANSI.WHITE}${exitToggleValue}${ANSI.RESET}  `;

    const cpRemaining = this.originalUnspentCp - this.calculateTotalCpUsed();
    const cpColor = cpRemaining > 0 ? ANSI.GREEN : (cpRemaining === 0 ? ANSI.WHITE : ANSI.RED);
    const cpDisplay = `${cpColor}${String(cpRemaining).padStart(4)}${ANSI.RESET}`;

    return [
      `      ${ANSI.CYAN}Exit:${ANSI.RESET} ${exitDisplay}      ${ANSI.CYAN}CP Left:${ANSI.RESET} ${cpDisplay}                   ${ANSI.DIM}SAVE or EXIT${ANSI.RESET}`,
      `${ANSI.DIM}⌐┴───────────────────────────────.     │${ANSI.RESET}`,
      `${ANSI.DIM}\\_________________________________\\___/${ANSI.RESET}`,
    ];
  }

  /** Strip ANSI escape codes to get visible length */
  private getVisibleLength(str: string): number {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1b\[[0-9;]*m/g, '').length;
  }

  /** Pad a string to reach a target column (auto-calculates visible length) */
  private padToColumn(str: string, targetCol: number): string {
    const visibleLen = this.getVisibleLength(str);
    const padding = Math.max(0, targetCol - visibleLen);
    return str + ' '.repeat(padding);
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
