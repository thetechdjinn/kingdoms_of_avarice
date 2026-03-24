/**
 * Shared tab component with WAI-ARIA keyboard navigation.
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

function setTabState(buttons: NodeListOf<Element>, panels: NodeListOf<Element>, activeBtn: Element, root: Document | HTMLElement, onTabChange?: (tabName: string) => void): void {
  const tabName = (activeBtn as HTMLElement).dataset.tab;
  if (!tabName) return;

  buttons.forEach(b => {
    const el = b as HTMLElement;
    const isActive = b === activeBtn;
    el.classList.toggle('active', isActive);
    el.setAttribute('aria-selected', String(isActive));
    el.tabIndex = isActive ? 0 : -1;
  });

  panels.forEach(c => c.classList.remove('active'));
  const tabContent = root.querySelector(`#tab-${tabName}`);
  if (tabContent) tabContent.classList.add('active');

  onTabChange?.(tabName);
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
  const btnArray = Array.from(buttons);

  // Set ARIA roles and initial tabindex
  buttons.forEach(btn => {
    const el = btn as HTMLElement;
    el.setAttribute('role', 'tab');
    const tabName = el.dataset.tab;
    if (tabName) {
      el.setAttribute('aria-controls', `tab-${tabName}`);
      const isActive = el.classList.contains('active');
      el.setAttribute('aria-selected', String(isActive));
      el.tabIndex = isActive ? 0 : -1;
    }
  });

  panels.forEach(panel => {
    const el = panel as HTMLElement;
    el.setAttribute('role', 'tabpanel');
    // Link panel back to its controlling tab button
    const panelId = el.id;  // e.g. "tab-basic"
    const tabName = panelId.startsWith('tab-') ? panelId.slice(4) : '';
    const controllingBtn = btnArray.find(b => (b as HTMLElement).dataset.tab === tabName);
    if (controllingBtn) {
      el.setAttribute('aria-labelledby', controllingBtn.id || '');
    }
  });

  // Mark the tab button container as a tablist
  const firstBtn = buttons[0] as HTMLElement | null;
  if (firstBtn?.parentElement) {
    firstBtn.parentElement.setAttribute('role', 'tablist');
  }

  // Click handler
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      setTabState(buttons, panels, btn, root, onTabChange);
    });
  });

  // Keyboard navigation: ArrowLeft/ArrowRight to move between tabs
  buttons.forEach(btn => {
    btn.addEventListener('keydown', (e) => {
      const event = e as KeyboardEvent;
      let targetIndex = -1;
      const currentIndex = btnArray.indexOf(btn);

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        targetIndex = (currentIndex + 1) % btnArray.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        targetIndex = (currentIndex - 1 + btnArray.length) % btnArray.length;
      } else if (event.key === 'Home') {
        event.preventDefault();
        targetIndex = 0;
      } else if (event.key === 'End') {
        event.preventDefault();
        targetIndex = btnArray.length - 1;
      }

      if (targetIndex >= 0) {
        const target = btnArray[targetIndex] as HTMLElement;
        setTabState(buttons, panels, target, root, onTabChange);
        target.focus();
      }
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
    const el = b as HTMLElement;
    const isActive = el.dataset.tab === tabName;
    el.classList.toggle('active', isActive);
    el.setAttribute('aria-selected', String(isActive));
    el.tabIndex = isActive ? 0 : -1;
  });

  panels.forEach(c => c.classList.remove('active'));
  const tabContent = root.querySelector(`#tab-${tabName}`);
  if (tabContent) tabContent.classList.add('active');
}
