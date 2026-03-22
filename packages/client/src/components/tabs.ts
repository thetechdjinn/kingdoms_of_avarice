/**
 * Shared tab component.
 * Replaces per-editor setupTabs() implementations.
 *
 * Expects HTML structure:
 *   <button class="tab-btn" data-tab="basic">Basic</button>
 *   <div class="tab-content" id="tab-basic">...</div>
 *
 * CSS is already in editor.css (.tab-btn, .tab-content, .active)
 *
 * Usage:
 *   import { setupTabs } from './components/tabs.js';
 *   setupTabs();                          // default: '.tab-btn' / '.tab-content'
 *   setupTabs({ container: myElement });  // scoped to a specific container
 */

export interface TabOptions {
  /** Container element to scope tab buttons/content. Defaults to document. */
  container?: HTMLElement;
  /** Selector for tab buttons. Defaults to '.tab-btn'. */
  buttonSelector?: string;
  /** Selector for tab content panels. Defaults to '.tab-content'. */
  contentSelector?: string;
  /** Callback when a tab is activated. */
  onTabChange?: (tabName: string) => void;
}

export function setupTabs(options: TabOptions = {}): void {
  const {
    container,
    buttonSelector = '.tab-btn',
    contentSelector = '.tab-content',
    onTabChange,
  } = options;

  const root = container ?? document;
  const buttons = root.querySelectorAll(buttonSelector);
  const panels = root.querySelectorAll(contentSelector);

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = (btn as HTMLElement).dataset.tab;
      if (!tabName) return;

      // Deactivate all
      buttons.forEach(b => b.classList.remove('active'));
      panels.forEach(c => c.classList.remove('active'));

      // Activate selected
      btn.classList.add('active');
      const tabContent = root.querySelector(`#tab-${tabName}`);
      if (tabContent) tabContent.classList.add('active');

      onTabChange?.(tabName);
    });
  });
}

/**
 * Programmatically activate a tab by name.
 */
export function activateTab(tabName: string, options: Pick<TabOptions, 'container' | 'buttonSelector' | 'contentSelector'> = {}): void {
  const {
    container,
    buttonSelector = '.tab-btn',
    contentSelector = '.tab-content',
  } = options;

  const root = container ?? document;
  const buttons = root.querySelectorAll(buttonSelector);
  const panels = root.querySelectorAll(contentSelector);

  buttons.forEach(b => {
    if ((b as HTMLElement).dataset.tab === tabName) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  panels.forEach(c => c.classList.remove('active'));
  const tabContent = root.querySelector(`#tab-${tabName}`);
  if (tabContent) tabContent.classList.add('active');
}
