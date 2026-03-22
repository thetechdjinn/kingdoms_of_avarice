/**
 * ChipTagInput — type to search, select adds as chip with X to remove.
 * Replaces comma-separated text fields for classes, races, areas, traits, keywords.
 *
 * Can operate in two modes:
 * 1. Constrained: options provided, user picks from them (like multi-select SearchableSelect)
 * 2. Freeform: no options provided, user types and presses Enter to add any value
 *
 * Usage (constrained):
 *   const tags = new ChipTagInput({
 *     container: document.getElementById('class-tags')!,
 *     placeholder: 'Add classes...',
 *     options: ['Warrior', 'Mage', 'Cleric', 'Rogue', 'Paladin', 'Ranger'],
 *     onChange: (values) => console.log('Selected:', values),
 *   });
 *   tags.setValues(['Warrior', 'Mage']);
 *
 * Usage (freeform):
 *   const tags = new ChipTagInput({
 *     container: document.getElementById('keyword-tags')!,
 *     placeholder: 'Add keywords...',
 *     freeform: true,
 *     onChange: (values) => console.log('Keywords:', values),
 *   });
 */

export interface ChipTagInputOptions {
  /** Container element where the component will be rendered. */
  container: HTMLElement;
  /** Placeholder text for the input. */
  placeholder?: string;
  /** Available options for constrained mode. Not needed for freeform. */
  options?: string[];
  /** Allow arbitrary values (Enter to add). Default: false. */
  freeform?: boolean;
  /** Callback when values change. */
  onChange?: (values: string[]) => void;
  /** Case-insensitive matching. Default: true. */
  caseInsensitive?: boolean;
}

export class ChipTagInput {
  private container: HTMLElement;
  private chipsEl: HTMLDivElement;
  private input: HTMLInputElement;
  private dropdown: HTMLDivElement | null = null;
  private options: string[];
  private values: string[] = [];
  private highlightIndex: number = -1;
  private config: ChipTagInputOptions;
  private isOpen: boolean = false;
  private boundOutsideClick!: (e: MouseEvent) => void;

  constructor(config: ChipTagInputOptions) {
    this.config = config;
    this.container = config.container;
    this.options = config.options ?? [];

    // Build DOM
    const wrapper = document.createElement('div');
    wrapper.className = 'ct-wrapper';

    this.chipsEl = document.createElement('div');
    this.chipsEl.className = 'ct-chips';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.className = 'ct-input';
    this.input.placeholder = config.placeholder ?? 'Type to add...';
    this.chipsEl.appendChild(this.input);

    wrapper.appendChild(this.chipsEl);

    // Dropdown only for constrained mode
    if (!config.freeform && this.options.length > 0) {
      this.dropdown = document.createElement('div');
      this.dropdown.className = 'ct-dropdown';
      this.dropdown.style.display = 'none';
      wrapper.appendChild(this.dropdown);
    }

    this.container.innerHTML = '';
    this.container.appendChild(wrapper);

    this.bindEvents();
  }

  private bindEvents(): void {
    this.input.addEventListener('input', () => {
      if (this.dropdown) {
        this.filterAndShow();
      }
    });

    this.input.addEventListener('focus', () => {
      if (this.dropdown && !this.config.freeform) {
        this.filterAndShow();
      }
    });

    this.input.addEventListener('keydown', (e) => this.handleKeydown(e));

    // Click on chips area focuses input
    this.chipsEl.addEventListener('click', () => this.input.focus());

    // Close dropdown on outside click (stored ref for cleanup in destroy())
    this.boundOutsideClick = (e: MouseEvent) => {
      if (!this.container.contains(e.target as Node)) {
        this.closeDropdown();
      }
    };
    document.addEventListener('click', this.boundOutsideClick);
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (this.isOpen && this.highlightIndex >= 0) {
        const items = this.dropdown?.querySelectorAll('.ct-option:not(.ct-disabled)');
        if (items && this.highlightIndex < items.length) {
          const value = (items[this.highlightIndex] as HTMLElement).dataset.value;
          if (value) this.addValue(value);
        }
      } else if (this.config.freeform) {
        const value = this.input.value.trim();
        if (value) this.addValue(value);
      }
      return;
    }

    if (e.key === 'Escape') {
      this.closeDropdown();
      return;
    }

    if (e.key === 'Backspace' && this.input.value === '' && this.values.length > 0) {
      this.removeValue(this.values[this.values.length - 1]);
      return;
    }

    if (e.key === 'ArrowDown' && this.isOpen) {
      e.preventDefault();
      const items = this.dropdown?.querySelectorAll('.ct-option:not(.ct-disabled)');
      if (items) {
        this.highlightIndex = Math.min(this.highlightIndex + 1, items.length - 1);
        this.updateHighlight(items);
      }
      return;
    }

    if (e.key === 'ArrowUp' && this.isOpen) {
      e.preventDefault();
      this.highlightIndex = Math.max(this.highlightIndex - 1, 0);
      const items = this.dropdown?.querySelectorAll('.ct-option:not(.ct-disabled)');
      if (items) this.updateHighlight(items);
      return;
    }
  }

  private updateHighlight(items: NodeListOf<Element>): void {
    items.forEach((el, i) => {
      el.classList.toggle('ct-highlighted', i === this.highlightIndex);
      if (i === this.highlightIndex) {
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  private filterAndShow(): void {
    if (!this.dropdown) return;

    const query = this.input.value.toLowerCase().trim();
    const ci = this.config.caseInsensitive !== false;

    const filtered = this.options.filter(opt => {
      const matchStr = ci ? opt.toLowerCase() : opt;
      const queryStr = ci ? query : this.input.value.trim();
      return !query || matchStr.includes(queryStr);
    });

    this.dropdown.innerHTML = '';
    this.highlightIndex = -1;

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ct-empty';
      empty.textContent = query ? 'No matches' : 'No options available';
      this.dropdown.appendChild(empty);
    } else {
      for (const opt of filtered) {
        const el = document.createElement('div');
        el.className = 'ct-option';
        el.dataset.value = opt;

        const isSelected = this.values.some(v =>
          ci ? v.toLowerCase() === opt.toLowerCase() : v === opt
        );
        if (isSelected) {
          el.classList.add('ct-disabled');
          el.textContent = `${opt} (added)`;
        } else {
          el.textContent = opt;
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            this.addValue(opt);
          });
        }

        this.dropdown.appendChild(el);
      }
    }

    this.dropdown.style.display = 'block';
    this.isOpen = true;
  }

  private closeDropdown(): void {
    if (this.dropdown) {
      this.dropdown.style.display = 'none';
    }
    this.isOpen = false;
    this.highlightIndex = -1;
  }

  private addValue(value: string): void {
    const ci = this.config.caseInsensitive !== false;
    const exists = this.values.some(v =>
      ci ? v.toLowerCase() === value.toLowerCase() : v === value
    );
    if (exists) return;

    this.values.push(value);
    this.input.value = '';
    this.renderChips();
    this.config.onChange?.(this.values);

    if (this.dropdown) {
      this.filterAndShow();
    }
  }

  private removeValue(value: string): void {
    const ci = this.config.caseInsensitive !== false;
    this.values = this.values.filter(v =>
      ci ? v.toLowerCase() !== value.toLowerCase() : v !== value
    );
    this.renderChips();
    this.config.onChange?.(this.values);

    if (this.isOpen && this.dropdown) {
      this.filterAndShow();
    }
  }

  private renderChips(): void {
    // Remove existing chips (keep input)
    const chips = this.chipsEl.querySelectorAll('.ct-chip');
    chips.forEach(c => c.remove());

    // Insert chips before input
    for (const value of this.values) {
      const chip = document.createElement('span');
      chip.className = 'ct-chip';
      chip.innerHTML = `
        ${escapeHtml(value)}
        <button type="button" class="ct-chip-remove">&times;</button>
      `;
      chip.querySelector('.ct-chip-remove')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeValue(value);
      });
      this.chipsEl.insertBefore(chip, this.input);
    }
  }

  // ---- Public API ----

  /** Set the current values. */
  setValues(values: string[]): void {
    this.values = [...values];
    this.renderChips();
  }

  /** Get the current values. */
  getValues(): string[] {
    return [...this.values];
  }

  /** Clear all values. */
  clear(): void {
    this.values = [];
    this.input.value = '';
    this.renderChips();
    this.config.onChange?.([]);
  }

  /** Replace the available options (constrained mode). */
  setOptions(options: string[]): void {
    this.options = options;
    if (this.isOpen && this.dropdown) {
      this.filterAndShow();
    }
  }

  /** Destroy the component. */
  destroy(): void {
    document.removeEventListener('click', this.boundOutsideClick);
    this.container.innerHTML = '';
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
