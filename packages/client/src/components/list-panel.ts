/**
 * Shared list panel component.
 * Provides search/filter input with debounced filtering and selection tracking.
 * Replaces per-editor renderList() + search wiring (~40-80 LOC each).
 *
 * Usage:
 *   import { ListPanel } from './components/list-panel.js';
 *
 *   const list = new ListPanel<Action>({
 *     listElement: document.getElementById('action-list')!,
 *     searchInput: document.getElementById('search-input') as HTMLInputElement,
 *     onSelect: (item) => selectAction(item.id),
 *     getId: (item) => item.id,
 *     renderItem: (item) => `
 *       <span class="action-command">${item.command}</span>
 *     `,
 *     filterFn: (item, search) =>
 *       item.command.toLowerCase().includes(search) ||
 *       (item.description?.toLowerCase().includes(search) ?? false),
 *     sortFn: (a, b) => a.command.localeCompare(b.command),
 *   });
 *
 *   list.setItems(actions);
 *   list.setSelected(selectedId);
 */

export interface ListPanelOptions<T> {
  /** The UL or container element to render list items into. */
  listElement: HTMLElement;
  /** Search input for text filtering. */
  searchInput?: HTMLInputElement;
  /** Optional dropdown filter element (e.g., type filter). */
  filterSelect?: HTMLSelectElement;
  /** Callback when an item is clicked. */
  onSelect: (item: T) => void;
  /** Extract a unique ID from an item. */
  getId: (item: T) => number | string;
  /** Return inner HTML for a list item. */
  renderItem: (item: T, isSelected: boolean) => string;
  /** Return CSS class(es) for a list item (beyond 'selected'). Optional. */
  getItemClass?: (item: T) => string;
  /** Filter items by search term (lowercased). */
  filterFn?: (item: T, searchTerm: string) => boolean;
  /** Filter items by dropdown value. */
  dropdownFilterFn?: (item: T, filterValue: string) => boolean;
  /** Sort items before rendering. */
  sortFn?: (a: T, b: T) => number;
  /** Debounce delay in ms for search input. Default: 100. */
  debounceMs?: number;
  /** Callback fired after each render with filtered and total counts. */
  onRender?: (filteredCount: number, totalCount: number) => void;
}

export class ListPanel<T> {
  private items: T[] = [];
  private selectedId: number | string | null = null;
  private options: ListPanelOptions<T>;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private boundSearch: (() => void) | null = null;
  private boundFilter: (() => void) | null = null;

  constructor(options: ListPanelOptions<T>) {
    this.options = options;

    // Wire up search input
    if (options.searchInput) {
      this.boundSearch = () => this.debouncedRender();
      options.searchInput.addEventListener('input', this.boundSearch);
    }

    // Wire up filter dropdown
    if (options.filterSelect) {
      this.boundFilter = () => this.render();
      options.filterSelect.addEventListener('change', this.boundFilter);
    }
  }

  /** Replace the full item list and re-render. */
  setItems(items: T[]): void {
    this.items = items;
    this.render();
  }

  /** Get the current items. */
  getItems(): T[] {
    return this.items;
  }

  /** Set the selected item ID and re-render. */
  setSelected(id: number | string | null): void {
    this.selectedId = id;
    this.render();
  }

  /** Get filtered + sorted items (current view). */
  getFilteredItems(): T[] {
    let filtered = [...this.items];

    // Apply dropdown filter
    if (this.options.filterSelect && this.options.dropdownFilterFn) {
      const filterValue = this.options.filterSelect.value;
      if (filterValue) {
        filtered = filtered.filter(item => this.options.dropdownFilterFn!(item, filterValue));
      }
    }

    // Apply search filter
    if (this.options.searchInput && this.options.filterFn) {
      const searchTerm = this.options.searchInput.value.toLowerCase().trim();
      if (searchTerm) {
        filtered = filtered.filter(item => this.options.filterFn!(item, searchTerm));
      }
    }

    // Apply sort
    if (this.options.sortFn) {
      filtered.sort(this.options.sortFn);
    }

    return filtered;
  }

  /** Re-render the list. */
  render(): void {
    const filtered = this.getFilteredItems();
    const { listElement, getId, renderItem, getItemClass, onSelect, onRender } = this.options;

    listElement.innerHTML = '';
    for (const item of filtered) {
      const id = getId(item);
      const isSelected = id === this.selectedId;

      const li = document.createElement('li');
      let className = isSelected ? 'selected' : '';
      if (getItemClass) {
        const extra = getItemClass(item);
        if (extra) className = className ? `${className} ${extra}` : extra;
      }
      if (className) li.className = className;
      li.dataset.id = String(id);
      li.innerHTML = renderItem(item, isSelected);
      li.addEventListener('click', () => onSelect(item));
      listElement.appendChild(li);
    }

    if (onRender) {
      onRender(filtered.length, this.items.length);
    }
  }

  private debouncedRender(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.render(), this.options.debounceMs ?? 100);
  }

  /** Get the count of currently displayed items. */
  get filteredCount(): number {
    return this.getFilteredItems().length;
  }

  /** Get the total item count (unfiltered). */
  get totalCount(): number {
    return this.items.length;
  }

  /** Destroy the component and clean up event listeners. */
  destroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.boundSearch && this.options.searchInput) {
      this.options.searchInput.removeEventListener('input', this.boundSearch);
    }
    if (this.boundFilter && this.options.filterSelect) {
      this.options.filterSelect.removeEventListener('change', this.boundFilter);
    }
    this.options.listElement.innerHTML = '';
  }
}
