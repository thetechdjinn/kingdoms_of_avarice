/**
 * Form Field Types for ANSI Terminal Forms
 */

export type FieldType = 'text' | 'number' | 'toggle' | 'stat' | 'label' | 'button';

export interface FieldValue {
  current: number;
  min: number;
  max: number;
  spent: number;  // CP already spent on this stat
}

export interface FormFieldConfig {
  type: FieldType;
  name: string;
  label: string;
  value?: string | number | boolean | FieldValue;
  editable?: boolean;
  options?: string[];  // For toggle fields
  row: number;
  col: number;
  labelCol?: number;
  width?: number;
  action?: string;  // For button fields (e.g., 'save', 'exit')
}

export class FormField {
  type: FieldType;
  name: string;
  label: string;
  value: string | number | boolean | FieldValue;
  editable: boolean;
  options: string[];
  row: number;
  col: number;
  labelCol: number;
  width: number;
  action?: string;

  // Track original value for stat fields (for calculating changes)
  originalValue?: FieldValue;

  constructor(config: FormFieldConfig) {
    this.type = config.type;
    this.name = config.name;
    this.label = config.label;
    this.value = config.value ?? '';
    this.editable = config.editable ?? true;
    this.options = config.options ?? [];
    this.row = config.row;
    this.col = config.col;
    this.labelCol = config.labelCol ?? config.col - config.label.length - 2;
    this.width = config.width ?? 20;
    this.action = config.action;

    // Store original value for stat fields
    if (this.type === 'stat' && typeof this.value === 'object') {
      this.originalValue = { ...this.value };
    }
  }

  /**
   * Render the field as an ANSI string
   * @param selected Whether this field is currently selected
   * @returns ANSI-formatted string for the field
   */
  render(selected: boolean): string {
    const reset = '\x1b[0m';
    const labelColor = '\x1b[36m';  // Cyan for labels
    const valueColor = selected ? '\x1b[1;32m' : '\x1b[37m';  // Bold green if selected, white otherwise
    const readonlyColor = '\x1b[90m';  // Gray for readonly
    const buttonColor = selected ? '\x1b[1;33m' : '\x1b[33m';  // Yellow for buttons
    const highlightBg = selected ? '\x1b[44m' : '';  // Blue background if selected

    switch (this.type) {
      case 'label':
        return `${labelColor}${this.label}${reset}`;

      case 'text':
      case 'number':
        if (!this.editable) {
          return `${labelColor}${this.label}: ${reset}${readonlyColor}${this.value}${reset}`;
        }
        return `${labelColor}${this.label}: ${reset}${highlightBg}${valueColor}${this.value}${reset}`;

      case 'toggle': {
        const toggleValue = this.options[Number(this.value) || 0] || String(this.value);
        if (!this.editable) {
          return `${labelColor}${this.label}: ${reset}${readonlyColor}${toggleValue}${reset}`;
        }
        return `${labelColor}${this.label}: ${reset}${highlightBg}${valueColor}${toggleValue}${reset}`;
      }

      case 'stat':
        return this.renderStatField(selected);

      case 'button': {
        const brackets = selected ? `${buttonColor}[${reset}` : '[';
        const bracketsEnd = selected ? `${buttonColor}]${reset}` : ']';
        return `${brackets}${highlightBg}${buttonColor}${this.label}${reset}${bracketsEnd}`;
      }

      default:
        return `${this.label}: ${this.value}`;
    }
  }

  /**
   * Render a stat field with current value and +/- indicators
   */
  private renderStatField(selected: boolean): string {
    const reset = '\x1b[0m';
    const labelColor = '\x1b[36m';  // Cyan for labels
    const valueColor = '\x1b[1;37m';  // Bold white for value
    const minColor = '\x1b[90m';  // Gray for min/max
    const arrowColor = selected ? '\x1b[1;32m' : '\x1b[32m';  // Green for arrows
    const highlightBg = selected ? '\x1b[44m' : '';

    const stat = this.value as FieldValue;
    const canDecrease = stat.current > stat.min;
    const canIncrease = stat.current < stat.max;

    const leftArrow = canDecrease ? `${arrowColor}<${reset}` : ' ';
    const rightArrow = canIncrease ? `${arrowColor}>${reset}` : ' ';

    // Format: "STR: <45> (40-65)"
    const valueStr = `${highlightBg}${leftArrow}${valueColor}${stat.current}${reset}${highlightBg}${rightArrow}${reset}`;
    const rangeStr = `${minColor}(${stat.min}-${stat.max})${reset}`;

    return `${labelColor}${this.label}:${reset} ${valueStr} ${rangeStr}`;
  }

  /**
   * Handle input for this field
   * @param key The key pressed
   * @returns true if the field value changed
   */
  handleInput(key: string): boolean {
    if (!this.editable) return false;

    switch (this.type) {
      case 'stat':
        return this.handleStatInput(key);
      case 'toggle':
        return this.handleToggleInput(key);
      case 'number':
        return this.handleNumberInput(key);
      case 'text':
        return this.handleTextInput(key);
      default:
        return false;
    }
  }

  private handleStatInput(key: string): boolean {
    const stat = this.value as FieldValue;

    if ((key === 'ArrowDown' || key === '-') && stat.current > stat.min) {
      stat.current--;
      stat.spent--;
      return true;
    }

    if ((key === 'ArrowUp' || key === '+' || key === '=') && stat.current < stat.max) {
      stat.current++;
      stat.spent++;
      return true;
    }

    return false;
  }

  private handleToggleInput(key: string): boolean {
    if (key === ' ' || key === 'Enter' || key === 'ArrowUp' || key === 'ArrowDown') {
      const currentIndex = typeof this.value === 'number' ? this.value : 0;
      if (key === 'ArrowDown') {
        this.value = (currentIndex + 1) % this.options.length;
      } else {
        this.value = (currentIndex - 1 + this.options.length) % this.options.length;
      }
      return true;
    }
    return false;
  }

  private handleNumberInput(key: string): boolean {
    const current = typeof this.value === 'number' ? this.value : parseInt(String(this.value)) || 0;

    if (key === 'ArrowUp' || key === '+' || key === '=') {
      this.value = current + 1;
      return true;
    }
    if (key === 'ArrowDown' || key === '-') {
      this.value = Math.max(0, current - 1);
      return true;
    }
    if (key >= '0' && key <= '9') {
      this.value = parseInt(String(this.value) + key) || 0;
      return true;
    }
    if (key === 'Backspace') {
      const str = String(this.value);
      this.value = parseInt(str.slice(0, -1)) || 0;
      return true;
    }

    return false;
  }

  private handleTextInput(key: string): boolean {
    const current = String(this.value);

    if (key === 'Backspace') {
      this.value = current.slice(0, -1);
      return true;
    }
    if (key.length === 1 && key >= ' ' && key <= '~') {
      if (current.length < this.width) {
        this.value = current + key;
        return true;
      }
    }

    return false;
  }

  /**
   * Get the CP change for this stat field
   */
  getCpChange(): number {
    if (this.type !== 'stat' || !this.originalValue) return 0;
    const current = this.value as FieldValue;
    return current.spent - this.originalValue.spent;
  }

  /**
   * Reset stat field to original value
   */
  reset(): void {
    if (this.type === 'stat' && this.originalValue) {
      this.value = { ...this.originalValue };
    }
  }
}
