/**
 * SearchableSelect — filterable dropdown with keyboard navigation.
 * Replaces raw ID inputs and oversized <select> elements.
 * Supports single-select and multi-select modes, optional grouping.
 * ARIA combobox pattern. No external dependencies.
 *
 * Usage (single-select):
 *   const select = new SearchableSelect({
 *     container: document.getElementById('room-select-container')!,
 *     placeholder: 'Search rooms...',
 *     options: rooms.map(r => ({ value: String(r.id), label: r.name, group: r.area })),
 *     onChange: (value) => console.log('Selected:', value),
 *   });
 *   select.setValue('42');
 *   const val = select.getValue(); // '42' or null
 *
 * Usage (multi-select):
 *   const select = new SearchableSelect({
 *     container: document.getElementById('class-select-container')!,
 *     placeholder: 'Select classes...',
 *     multi: true,
 *     options: classes.map(c => ({ value: c.id, label: c.displayName })),
 *     onChange: (values) => console.log('Selected:', values),
 *   });
 *   select.setValues(['warrior', 'mage']);
 */

export interface SelectOption {
  value: string;
  label: string;
  /** Optional group name for grouped display. */
  group?: string;
  /** Optional secondary text shown dimmer. */
  detail?: string;
}

export interface SearchableSelectOptions {
  /** Container element where the component will be rendered. */
  container: HTMLElement;
  /** Placeholder text for the search input. */
  placeholder?: string;
  /** Available options. Can be updated later via setOptions(). */
  options?: SelectOption[];
  /** Enable multi-select mode. Default: false (single-select). */
  multi?: boolean;
  /** Callback when selection changes. */
  onChange?: (value: string | null, values?: string[]) => void;
  /** Maximum visible options in dropdown before scrolling. Default: 8. */
  maxVisible?: number;
  /** Allow clearing the selection. Default: true. */
  clearable?: boolean;
  /** Custom filter function. Default: case-insensitive match on label + value + detail. */
  filterFn?: (option: SelectOption, query: string) => boolean;
  /** Width CSS value. Default: '100%'. */
  width?: string;
}

export class SearchableSelect {
  private container: HTMLElement;
  private input: HTMLInputElement;
  private dropdown: HTMLDivElement;
  private clearBtn: HTMLButtonElement;
  private wrapper: HTMLDivElement;
  private options: SelectOption[] = [];
  private filteredOptions: SelectOption[] = [];
  private selectedValues: Set<string> = new Set();
  private highlightIndex: number = -1;
  private isOpen: boolean = false;
  private multi: boolean;
  private config: SearchableSelectOptions;
  private chipContainer: HTMLDivElement | null = null;
  private boundOutsideClick!: (e: MouseEvent) => void;

  // Track unique ID for ARIA
  private static instanceCount = 0;
  private instanceId: string;

  constructor(config: SearchableSelectOptions) {
    this.config = config;
    this.container = config.container;
    this.multi = config.multi ?? false;
    this.options = config.options ?? [];
    this.filteredOptions = [...this.options];

    SearchableSelect.instanceCount++;
    this.instanceId = `ss-${SearchableSelect.instanceCount}`;

    // Build DOM
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'ss-wrapper';
    if (config.width) this.wrapper.style.width = config.width;

    // Chip container for multi-select
    if (this.multi) {
      this.chipContainer = document.createElement('div');
      this.chipContainer.className = 'ss-chips';
      this.wrapper.appendChild(this.chipContainer);
    }

    const inputWrap = document.createElement('div');
    inputWrap.className = 'ss-input-wrap';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.className = 'ss-input';
    this.input.placeholder = config.placeholder ?? 'Search...';
    this.input.setAttribute('role', 'combobox');
    this.input.setAttribute('aria-expanded', 'false');
    this.input.setAttribute('aria-autocomplete', 'list');
    this.input.setAttribute('aria-controls', `${this.instanceId}-list`);
    inputWrap.appendChild(this.input);

    this.clearBtn = document.createElement('button');
    this.clearBtn.type = 'button';
    this.clearBtn.className = 'ss-clear';
    this.clearBtn.innerHTML = '&times;';
    this.clearBtn.title = 'Clear';
    this.clearBtn.style.display = 'none';
    inputWrap.appendChild(this.clearBtn);

    this.wrapper.appendChild(inputWrap);

    this.dropdown = document.createElement('div');
    this.dropdown.className = 'ss-dropdown';
    this.dropdown.id = `${this.instanceId}-list`;
    this.dropdown.setAttribute('role', 'listbox');
    this.dropdown.style.display = 'none';
    this.wrapper.appendChild(this.dropdown);

    this.container.innerHTML = '';
    this.container.appendChild(this.wrapper);

    this.bindEvents();
    this.updateClearButton();
  }

  private bindEvents(): void {
    // Input events
    this.input.addEventListener('input', () => {
      this.filterOptions();
      this.open();
    });

    this.input.addEventListener('focus', () => {
      this.filterOptions();
      this.open();
    });

    this.input.addEventListener('keydown', (e) => this.handleKeydown(e));

    // Clear button
    this.clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clear();
    });

    // Close on outside click (stored ref for cleanup in destroy())
    this.boundOutsideClick = (e: MouseEvent) => {
      if (!this.wrapper.contains(e.target as Node)) {
        this.close();
      }
    };
    document.addEventListener('click', this.boundOutsideClick);
  }

  private handleKeydown(e: KeyboardEvent): void {
    const visibleItems = this.dropdown.querySelectorAll('.ss-option:not(.ss-group-header)');

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!this.isOpen) { this.open(); return; }
        this.highlightIndex = Math.min(this.highlightIndex + 1, visibleItems.length - 1);
        this.updateHighlight(visibleItems);
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (!this.isOpen) { this.open(); return; }
        this.highlightIndex = Math.max(this.highlightIndex - 1, 0);
        this.updateHighlight(visibleItems);
        break;

      case 'Enter':
        e.preventDefault();
        if (this.isOpen && this.highlightIndex >= 0 && this.highlightIndex < visibleItems.length) {
          const value = (visibleItems[this.highlightIndex] as HTMLElement).dataset.value;
          if (value !== undefined) this.selectValue(value);
        }
        break;

      case 'Escape':
        e.preventDefault();
        this.close();
        break;

      case 'Backspace':
        if (this.multi && this.input.value === '' && this.selectedValues.size > 0) {
          // Remove last chip
          const lastVal = [...this.selectedValues].pop();
          if (lastVal) this.deselectValue(lastVal);
        }
        break;
    }
  }

  private updateHighlight(items: NodeListOf<Element>): void {
    items.forEach((el, i) => {
      el.classList.toggle('ss-highlighted', i === this.highlightIndex);
      if (i === this.highlightIndex) {
        (el as HTMLElement).setAttribute('aria-selected', 'true');
        el.scrollIntoView({ block: 'nearest' });
        this.input.setAttribute('aria-activedescendant', (el as HTMLElement).id || '');
      } else {
        (el as HTMLElement).removeAttribute('aria-selected');
      }
    });
  }

  private filterOptions(): void {
    const query = this.input.value.toLowerCase().trim();
    const filterFn = this.config.filterFn ?? defaultFilter;

    if (!query) {
      this.filteredOptions = [...this.options];
    } else {
      this.filteredOptions = this.options.filter(opt => filterFn(opt, query));
    }

    this.renderDropdown();
  }

  private renderDropdown(): void {
    this.dropdown.innerHTML = '';
    this.highlightIndex = -1;

    if (this.filteredOptions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ss-empty';
      empty.textContent = 'No matches found';
      this.dropdown.appendChild(empty);
      return;
    }

    // Check if we need grouping
    const hasGroups = this.filteredOptions.some(o => o.group);

    if (hasGroups) {
      const groups = new Map<string, SelectOption[]>();
      const ungrouped: SelectOption[] = [];

      for (const opt of this.filteredOptions) {
        if (opt.group) {
          if (!groups.has(opt.group)) groups.set(opt.group, []);
          groups.get(opt.group)!.push(opt);
        } else {
          ungrouped.push(opt);
        }
      }

      // Render ungrouped first
      for (const opt of ungrouped) {
        this.dropdown.appendChild(this.createOptionEl(opt));
      }

      // Render groups
      for (const [groupName, groupOpts] of groups) {
        const header = document.createElement('div');
        header.className = 'ss-option ss-group-header';
        header.textContent = groupName;
        this.dropdown.appendChild(header);

        for (const opt of groupOpts) {
          this.dropdown.appendChild(this.createOptionEl(opt));
        }
      }
    } else {
      const maxVisible = this.config.maxVisible ?? 8;
      const toShow = this.filteredOptions.slice(0, maxVisible * 5); // render a generous amount
      for (const opt of toShow) {
        this.dropdown.appendChild(this.createOptionEl(opt));
      }
      if (this.filteredOptions.length > toShow.length) {
        const more = document.createElement('div');
        more.className = 'ss-empty';
        more.textContent = `${this.filteredOptions.length - toShow.length} more — type to filter`;
        this.dropdown.appendChild(more);
      }
    }
  }

  private createOptionEl(option: SelectOption): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'ss-option';
    el.dataset.value = option.value;
    el.setAttribute('role', 'option');

    if (this.selectedValues.has(option.value)) {
      el.classList.add('ss-selected');
    }

    let html = `<span class="ss-option-label">${escapeHtml(option.label)}</span>`;
    if (option.detail) {
      html += `<span class="ss-option-detail">${escapeHtml(option.detail)}</span>`;
    }
    el.innerHTML = html;

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectValue(option.value);
    });

    return el;
  }

  private selectValue(value: string): void {
    if (this.multi) {
      if (this.selectedValues.has(value)) {
        this.deselectValue(value);
      } else {
        this.selectedValues.add(value);
        this.renderChips();
        this.input.value = '';
        this.filterOptions();
        this.config.onChange?.(null, [...this.selectedValues]);
      }
    } else {
      this.selectedValues.clear();
      this.selectedValues.add(value);
      const opt = this.options.find(o => o.value === value);
      this.input.value = opt?.label ?? value;
      this.close();
      this.config.onChange?.(value);
    }
    this.updateClearButton();
  }

  private deselectValue(value: string): void {
    this.selectedValues.delete(value);
    if (this.multi) {
      this.renderChips();
      this.config.onChange?.(null, [...this.selectedValues]);
    } else {
      this.input.value = '';
      this.config.onChange?.(null);
    }
    this.updateClearButton();
    this.filterOptions();
  }

  private renderChips(): void {
    if (!this.chipContainer) return;
    this.chipContainer.innerHTML = '';

    for (const value of this.selectedValues) {
      const opt = this.options.find(o => o.value === value);
      const chip = document.createElement('span');
      chip.className = 'ss-chip';
      chip.innerHTML = `
        ${escapeHtml(opt?.label ?? value)}
        <button type="button" class="ss-chip-remove" data-value="${escapeHtml(value)}">&times;</button>
      `;
      chip.querySelector('.ss-chip-remove')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deselectValue(value);
      });
      this.chipContainer.appendChild(chip);
    }
  }

  private updateClearButton(): void {
    const clearable = this.config.clearable !== false;
    this.clearBtn.style.display = (clearable && this.selectedValues.size > 0) ? 'block' : 'none';
  }

  private open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.dropdown.style.display = 'block';
    this.input.setAttribute('aria-expanded', 'true');
    this.renderDropdown();
  }

  private close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.dropdown.style.display = 'none';
    this.input.setAttribute('aria-expanded', 'false');
    this.highlightIndex = -1;

    // For single-select, restore display text if value is set
    if (!this.multi && this.selectedValues.size > 0) {
      const value = [...this.selectedValues][0];
      const opt = this.options.find(o => o.value === value);
      this.input.value = opt?.label ?? value;
    }
  }

  // ---- Public API ----

  /** Set the selected value (single-select mode). */
  setValue(value: string | null): void {
    this.selectedValues.clear();
    if (value !== null && value !== '') {
      this.selectedValues.add(value);
      const opt = this.options.find(o => o.value === value);
      if (!this.multi) this.input.value = opt?.label ?? value;
    } else {
      if (!this.multi) this.input.value = '';
    }
    this.updateClearButton();
  }

  /** Set selected values (multi-select mode). */
  setValues(values: string[]): void {
    this.selectedValues = new Set(values);
    if (this.multi) this.renderChips();
    this.updateClearButton();
  }

  /** Get the selected value (single-select). Returns null if nothing selected. */
  getValue(): string | null {
    if (this.selectedValues.size === 0) return null;
    return [...this.selectedValues][0];
  }

  /** Get all selected values (multi-select). */
  getValues(): string[] {
    return [...this.selectedValues];
  }

  /** Clear the selection. */
  clear(): void {
    this.selectedValues.clear();
    this.input.value = '';
    if (this.multi) this.renderChips();
    this.updateClearButton();
    if (this.multi) {
      this.config.onChange?.(null, []);
    } else {
      this.config.onChange?.(null);
    }
  }

  /** Replace the options list. Preserves current selection if values still exist. */
  setOptions(options: SelectOption[]): void {
    this.options = options;
    // Remove selected values that no longer exist in options
    const validValues = new Set(options.map(o => o.value));
    for (const v of this.selectedValues) {
      if (!validValues.has(v)) this.selectedValues.delete(v);
    }
    if (this.multi) this.renderChips();
    else if (this.selectedValues.size > 0) {
      const val = [...this.selectedValues][0];
      const opt = options.find(o => o.value === val);
      this.input.value = opt?.label ?? val;
    }
    this.filteredOptions = [...options];
    if (this.isOpen) this.renderDropdown();
    this.updateClearButton();
  }

  /** Enable or disable the component. */
  setDisabled(disabled: boolean): void {
    this.input.disabled = disabled;
    this.wrapper.classList.toggle('ss-disabled', disabled);
    if (disabled) this.close();
  }

  /** Destroy the component and clean up event listeners. */
  destroy(): void {
    document.removeEventListener('click', this.boundOutsideClick);
    this.container.innerHTML = '';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultFilter(option: SelectOption, query: string): boolean {
  return (
    option.label.toLowerCase().includes(query) ||
    option.value.toLowerCase().includes(query) ||
    (option.detail?.toLowerCase().includes(query) ?? false)
  );
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
