/**
 * Training Form - ANSI form for character stat allocation
 */

import { Terminal } from 'xterm';
import { AnsiForm, FormConfig, FormSection } from './AnsiForm.js';
import { FormField, FieldValue, FormFieldConfig } from './FormField.js';
import { CPStatName, CP_STAT_ABBREVIATIONS, getCPCostForNextPoint } from '@koa/shared';

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
    hairLength?: string;
    hairColour?: string;
    eyeColour?: string;
  };
}

export interface TrainingFormResult {
  stats: Record<CPStatName, number>;  // Current values
  cpSpent: Record<CPStatName, number>;  // Spent per stat
  cancelled: boolean;
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

    // Character Info Section (read-only)
    const infoFields: FormFieldConfig[] = [
      { type: 'label', name: 'name_label', label: `Name: ${data.characterName}${data.familyName ? ' ' + data.familyName : ''}`, row: 0, col: 2 },
      { type: 'label', name: 'race_label', label: `Race: ${data.race}`, row: 1, col: 2 },
      { type: 'label', name: 'class_label', label: `Class: ${data.class}`, row: 1, col: 25 },
      { type: 'label', name: 'level_label', label: `Level: ${data.level}`, row: 1, col: 45 },
    ];

    sections.push({ title: 'Character', fields: infoFields });

    // Stats Section
    const statFields: FormFieldConfig[] = [];
    const stats: CPStatName[] = ['strength', 'agility', 'constitution', 'intellect', 'wisdom', 'charisma'];

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

    // CP Display Section
    const cpFields: FormFieldConfig[] = [
      { type: 'label', name: 'cp_display', label: `Unspent CP: ${data.unspentCp}`, row: 0, col: 2 },
    ];

    sections.push({ title: 'Character Points', fields: cpFields });

    // Buttons Section
    const buttonFields: FormFieldConfig[] = [
      { type: 'button', name: 'save_btn', label: 'SAVE', row: 0, col: 15, action: 'save', editable: true },
      { type: 'button', name: 'exit_btn', label: 'EXIT', row: 0, col: 35, action: 'exit', editable: true },
    ];

    sections.push({ title: '', fields: buttonFields });

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
      this.enforceStatLimits(field);
    }
  }

  /**
   * Enforce stat min/max based on available CP
   */
  private enforceStatLimits(changedField: FormField): void {
    const totalCpUsed = this.calculateTotalCpUsed();
    const cpRemaining = this.originalUnspentCp - totalCpUsed;

    // If we're over budget, revert the last change
    if (cpRemaining < 0) {
      const stat = changedField.value as FieldValue;
      if (stat.spent > (changedField.originalValue?.spent ?? 0)) {
        stat.current--;
        stat.spent--;
      }
      this.updateCpDisplay();
    }

    // Update the effective max for each stat based on remaining CP
    for (const field of this.fields) {
      if (field.type === 'stat') {
        const stat = field.value as FieldValue;
        const baseStat = this.formData.stats[field.name as CPStatName];

        // Calculate how many more points can be afforded
        let affordableIncrease = 0;
        let testSpent = stat.spent;
        let testCp = cpRemaining;

        while (testCp >= getCPCostForNextPoint(testSpent) && stat.current + affordableIncrease < baseStat.max) {
          testCp -= getCPCostForNextPoint(testSpent);
          testSpent++;
          affordableIncrease++;
        }

        // Effective max is current + what we can afford
        stat.max = Math.min(baseStat.max, stat.current + affordableIncrease);
      }
    }
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
   * Override to handle stat-specific left/right behavior
   */
  protected handleKey(key: string, event: KeyboardEvent): void {
    const currentField = this.editableFields[this.selectedIndex];

    // For stat fields, left/right adjusts the value
    if (currentField?.type === 'stat' && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      if (currentField.handleInput(key)) {
        this.onFieldChange(currentField);
        this.render();
      }
      return;
    }

    // Default handling for other keys
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

    for (const field of this.fields) {
      if (field.type === 'stat') {
        const stat = field.value as FieldValue;
        stats[field.name] = stat.current;
        cpSpent[field.name] = stat.spent;
      }
    }

    return {
      stats: stats as Record<CPStatName, number>,
      cpSpent: cpSpent as Record<CPStatName, number>,
      cancelled,
    };
  }

  /**
   * Override render to show training-specific layout
   */
  protected render(): void {
    // Update CP display before rendering
    this.updateCpDisplay();
    super.render();
  }

  /**
   * Get training-specific instructions
   */
  protected getInstructions(): string {
    return '\x1b[90m↑↓ Navigate fields  ←→ Adjust stats  Enter Save/Exit  Esc Cancel\x1b[0m';
  }
}

// Export for use in main.ts
export { FormField };
export type { FieldValue };
