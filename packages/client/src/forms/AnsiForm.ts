/**
 * Base ANSI Form System for xterm.js
 * Provides keyboard navigation and field handling for terminal-based forms
 */

import { Terminal } from 'xterm';
import { FormField, FormFieldConfig, FieldType } from './FormField.js';

export interface FormSection {
  title: string;
  fields: FormFieldConfig[];
}

export interface FormConfig {
  title: string;
  sections: FormSection[];
  width?: number;
  onSave?: (data: Record<string, unknown>) => void;
  onCancel?: () => void;
}

export abstract class AnsiForm {
  protected terminal: Terminal;
  protected fields: FormField[] = [];
  protected editableFields: FormField[] = [];
  protected selectedIndex: number = 0;
  protected isActive: boolean = false;
  protected config: FormConfig;

  // Keyboard handler reference for cleanup
  private keyHandler: ((event: KeyboardEvent) => void) | null = null;

  constructor(terminal: Terminal, config: FormConfig) {
    this.terminal = terminal;
    this.config = config;
    this.initFields();
  }

  /**
   * Initialize fields from config - override in subclass to customize
   */
  protected initFields(): void {
    for (const section of this.config.sections) {
      for (const fieldConfig of section.fields) {
        const field = new FormField(fieldConfig);
        this.fields.push(field);
        if (field.editable && field.type !== 'label') {
          this.editableFields.push(field);
        }
      }
    }
  }

  /**
   * Show the form on the terminal
   */
  show(): void {
    this.isActive = true;
    this.selectedIndex = 0;

    // Hide the command input while form is active
    const commandBar = document.getElementById('command-bar');
    const commandInput = document.getElementById('command-input') as HTMLInputElement;
    if (commandBar) {
      commandBar.style.display = 'none';
    }

    // Set up keyboard handler
    this.setupKeyboardHandler();

    // Clear terminal and render form
    this.terminal.clear();
    this.render();
  }

  /**
   * Hide the form and restore normal terminal operation
   */
  hide(): void {
    this.isActive = false;
    this.removeKeyboardHandler();

    // Show the command input again
    const commandBar = document.getElementById('command-bar');
    const commandInput = document.getElementById('command-input') as HTMLInputElement;
    if (commandBar) {
      commandBar.style.display = 'flex';
    }
    if (commandInput) {
      commandInput.focus();
    }
  }

  /**
   * Set up keyboard event handler
   */
  private setupKeyboardHandler(): void {
    // Remove any existing handler first to prevent duplicates
    this.removeKeyboardHandler();

    this.keyHandler = (event: KeyboardEvent) => {
      if (!this.isActive) return;

      // Prevent default for navigation and editing keys
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape', ' ', 'Backspace'].includes(event.key)) {
        event.preventDefault();
      }

      this.handleKey(event.key, event);
    };

    // Use capture to get events before the terminal
    window.addEventListener('keydown', this.keyHandler, true);
  }

  /**
   * Remove keyboard event handler
   */
  private removeKeyboardHandler(): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler, true);
      this.keyHandler = null;
    }
  }

  /**
   * Handle keyboard input
   */
  protected handleKey(key: string, event: KeyboardEvent): void {
    const currentField = this.editableFields[this.selectedIndex];

    switch (key) {
      case 'ArrowUp':
      case 'Tab':
        if (event.shiftKey || key === 'ArrowUp') {
          this.movePrevious();
        } else {
          this.moveNext();
        }
        break;

      case 'ArrowDown':
        this.moveNext();
        break;

      case 'Enter':
        if (currentField?.type === 'button') {
          this.handleButton(currentField);
        } else if (currentField?.type === 'toggle') {
          currentField.handleInput(key);
          this.render();
        }
        break;

      case 'Escape':
        this.handleCancel();
        break;

      default:
        // Pass input to current field
        if (currentField && currentField.handleInput(key)) {
          this.onFieldChange(currentField);
          this.render();
        }
        break;
    }
  }

  /**
   * Move to next editable field
   */
  protected moveNext(): void {
    if (this.editableFields.length === 0) return;
    this.selectedIndex = (this.selectedIndex + 1) % this.editableFields.length;
    this.render();
  }

  /**
   * Move to previous editable field
   */
  protected movePrevious(): void {
    if (this.editableFields.length === 0) return;
    this.selectedIndex = (this.selectedIndex - 1 + this.editableFields.length) % this.editableFields.length;
    this.render();
  }

  /**
   * Handle button activation
   */
  protected handleButton(field: FormField): void {
    switch (field.action) {
      case 'save':
        this.handleSave();
        break;
      case 'exit':
      case 'cancel':
        this.handleCancel();
        break;
      default:
        // Custom button action - subclass can override
        this.onButtonClick(field);
        break;
    }
  }

  /**
   * Handle save action
   */
  protected handleSave(): void {
    const data = this.collectData();
    this.hide();
    if (this.config.onSave) {
      this.config.onSave(data);
    }
  }

  /**
   * Handle cancel/exit action
   */
  protected handleCancel(): void {
    this.hide();
    if (this.config.onCancel) {
      this.config.onCancel();
    }
  }

  /**
   * Collect form data - override in subclass for custom data structure
   */
  protected collectData(): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const field of this.fields) {
      if (field.type !== 'label' && field.type !== 'button') {
        data[field.name] = field.value;
      }
    }
    return data;
  }

  /**
   * Called when a field value changes - override for custom behavior
   */
  protected onFieldChange(_field: FormField): void {
    // Override in subclass
  }

  /**
   * Called when a custom button is clicked - override for custom behavior
   */
  protected onButtonClick(_field: FormField): void {
    // Override in subclass
  }

  /**
   * Render the form to the terminal
   */
  protected render(): void {
    // Clear terminal
    this.terminal.clear();

    // Build the form display
    const lines: string[] = [];
    const width = this.config.width ?? 70;
    const border = '\x1b[32m' + '═'.repeat(width) + '\x1b[0m';

    // Title
    lines.push('');
    lines.push(border);
    lines.push(this.centerText(`\x1b[1;33m${this.config.title}\x1b[0m`, width));
    lines.push(border);
    lines.push('');

    // Render sections
    for (const section of this.config.sections) {
      // Section title
      if (section.title) {
        lines.push(`\x1b[1;36m── ${section.title} ──\x1b[0m`);
        lines.push('');
      }

      // Section fields - render based on row positions
      const sectionFields = this.fields.filter(f =>
        section.fields.some(sf => sf.name === f.name)
      );

      // Group fields by row
      const fieldsByRow = new Map<number, FormField[]>();
      for (const field of sectionFields) {
        if (!fieldsByRow.has(field.row)) {
          fieldsByRow.set(field.row, []);
        }
        fieldsByRow.get(field.row)!.push(field);
      }

      // Render each row
      const rows = Array.from(fieldsByRow.keys()).sort((a, b) => a - b);
      for (const row of rows) {
        const rowFields = fieldsByRow.get(row)!.sort((a, b) => a.col - b.col);
        let line = '';
        let currentCol = 0;

        for (const field of rowFields) {
          // Add padding to reach the field's column
          const padding = Math.max(0, field.col - currentCol);
          line += ' '.repeat(padding);
          currentCol = field.col;

          // Render the field
          const isSelected = this.editableFields[this.selectedIndex] === field;
          const rendered = field.render(isSelected);
          line += rendered;

          // Approximate column advance (ANSI codes don't count)
          currentCol += this.stripAnsi(rendered).length;
        }

        lines.push(line);
      }

      lines.push('');
    }

    // Footer with instructions
    lines.push(border);
    lines.push(this.getInstructions());
    lines.push('');

    // Write to terminal
    for (const line of lines) {
      this.terminal.write(line + '\r\n');
    }
  }

  /**
   * Get instruction text for the form
   */
  protected getInstructions(): string {
    return '\x1b[90m↑↓ Navigate  ←→ Adjust  Enter Select  Esc Cancel\x1b[0m';
  }

  /**
   * Center text within a given width
   */
  protected centerText(text: string, width: number): string {
    const stripped = this.stripAnsi(text);
    const padding = Math.max(0, Math.floor((width - stripped.length) / 2));
    return ' '.repeat(padding) + text;
  }

  /**
   * Strip ANSI escape codes from text
   */
  protected stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }

  /**
   * Check if form is currently active
   */
  isFormActive(): boolean {
    return this.isActive;
  }

  /**
   * Destroy the form and clean up
   */
  destroy(): void {
    this.hide();
    this.fields = [];
    this.editableFields = [];
  }
}
