/**
 * Shared modal/dialog component.
 * Replaces all prompt() and confirm() calls with styled, accessible dialogs.
 *
 * CSS is already in editor.css (.modal, .modal-content, .modal-header, .modal-body, .close-btn)
 *
 * Usage:
 *   import { showPrompt, showConfirm, showModal } from './components/modal.js';
 *
 *   const name = await showPrompt('Enter room name:', { defaultValue: 'New Room' });
 *   if (name === null) return; // cancelled
 *
 *   const confirmed = await showConfirm('Delete this item?');
 *   if (!confirmed) return;
 *
 *   // Multi-field:
 *   const result = await showPromptFields('Create Spell', [
 *     { key: 'name', label: 'Spell Name', required: true },
 *     { key: 'mnemonic', label: 'Mnemonic', required: true, maxLength: 10 },
 *   ]);
 */

export interface PromptOptions {
  defaultValue?: string;
  placeholder?: string;
  maxLength?: number;
  /** Validate input. Return error message string to block, or null/undefined to allow. */
  validate?: (value: string) => string | null | undefined;
}

export interface PromptField {
  key: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  type?: 'text' | 'number';
}

/**
 * Show a styled prompt dialog. Returns the entered string, or null if cancelled.
 */
export function showPrompt(message: string, options: PromptOptions = {}): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = createModalShell(message);
    const { overlay, body, footer } = modal;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'modal-input';
    input.value = options.defaultValue ?? '';
    if (options.placeholder) input.placeholder = options.placeholder;
    if (options.maxLength) input.maxLength = options.maxLength;
    body.appendChild(input);

    const errorEl = document.createElement('div');
    errorEl.className = 'modal-error';
    errorEl.style.display = 'none';
    body.appendChild(errorEl);

    const okBtn = createButton('OK', 'btn-primary');
    const cancelBtn = createButton('Cancel', 'btn-secondary');
    footer.appendChild(cancelBtn);
    footer.appendChild(okBtn);

    function submit() {
      const value = input.value.trim();
      if (options.validate) {
        const err = options.validate(value);
        if (err) {
          errorEl.textContent = err;
          errorEl.style.display = 'block';
          input.focus();
          return;
        }
      }
      cleanup(overlay);
      resolve(value || null);
    }

    okBtn.addEventListener('click', submit);
    cancelBtn.addEventListener('click', () => { cleanup(overlay); resolve(null); });
    modal.onClose = () => resolve(null);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') { cleanup(overlay); resolve(null); }
    });

    document.body.appendChild(overlay);
    input.focus();
    input.select();
  });
}

/**
 * Show a multi-field prompt dialog. Returns an object of key→value, or null if cancelled.
 */
export function showPromptFields(
  title: string,
  fields: PromptField[],
): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const modal = createModalShell(title);
    const { overlay, body, footer } = modal;

    const inputs: Map<string, HTMLInputElement> = new Map();

    for (const field of fields) {
      const group = document.createElement('div');
      group.className = 'modal-field-group';

      const label = document.createElement('label');
      label.className = 'modal-label';
      label.textContent = field.label + (field.required ? ' *' : '');
      group.appendChild(label);

      const input = document.createElement('input');
      input.type = field.type ?? 'text';
      input.className = 'modal-input';
      input.value = field.defaultValue ?? '';
      if (field.placeholder) input.placeholder = field.placeholder;
      if (field.maxLength) input.maxLength = field.maxLength;
      group.appendChild(input);

      body.appendChild(group);
      inputs.set(field.key, input);
    }

    const errorEl = document.createElement('div');
    errorEl.className = 'modal-error';
    errorEl.style.display = 'none';
    body.appendChild(errorEl);

    const okBtn = createButton('Create', 'btn-primary');
    const cancelBtn = createButton('Cancel', 'btn-secondary');
    footer.appendChild(cancelBtn);
    footer.appendChild(okBtn);

    function submit() {
      const result: Record<string, string> = {};
      for (const field of fields) {
        const input = inputs.get(field.key)!;
        const value = input.value.trim();
        if (field.required && !value) {
          errorEl.textContent = `${field.label} is required`;
          errorEl.style.display = 'block';
          input.focus();
          return;
        }
        result[field.key] = value;
      }
      cleanup(overlay);
      resolve(result);
    }

    okBtn.addEventListener('click', submit);
    cancelBtn.addEventListener('click', () => { cleanup(overlay); resolve(null); });
    modal.onClose = () => resolve(null);

    // Enter to submit on last field
    const lastInput = inputs.get(fields[fields.length - 1].key);
    lastInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });

    // Escape to cancel on any field
    inputs.forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { cleanup(overlay); resolve(null); }
      });
    });

    document.body.appendChild(overlay);
    inputs.get(fields[0].key)?.focus();
  });
}

/**
 * Show a styled confirm dialog. Returns true if confirmed, false if cancelled.
 */
export function showConfirm(
  message: string,
  options: { confirmText?: string; cancelText?: string; dangerous?: boolean } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = createModalShell('Confirm');
    const { overlay, body, footer } = modal;

    const msg = document.createElement('p');
    msg.className = 'modal-message';
    msg.textContent = message;
    body.appendChild(msg);

    const okBtn = createButton(
      options.confirmText ?? 'Confirm',
      options.dangerous ? 'btn-danger' : 'btn-primary',
    );
    const cancelBtn = createButton(options.cancelText ?? 'Cancel', 'btn-secondary');
    footer.appendChild(cancelBtn);
    footer.appendChild(okBtn);

    okBtn.addEventListener('click', () => { cleanup(overlay); resolve(true); });
    cancelBtn.addEventListener('click', () => { cleanup(overlay); resolve(false); });
    modal.onClose = () => resolve(false);

    // Keyboard
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { cleanup(overlay); resolve(true); }
      if (e.key === 'Escape') { cleanup(overlay); resolve(false); }
    });

    document.body.appendChild(overlay);
    okBtn.focus();
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface ModalShell {
  overlay: HTMLDivElement;
  content: HTMLDivElement;
  body: HTMLDivElement;
  footer: HTMLDivElement;
  onClose: (() => void) | null;
}

function createModalShell(title: string): ModalShell {
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.style.display = 'flex';

  const content = document.createElement('div');
  content.className = 'modal-content';

  const header = document.createElement('div');
  header.className = 'modal-header';

  const h3 = document.createElement('h3');
  h3.textContent = title;
  header.appendChild(h3);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.innerHTML = '&times;';
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'modal-body';

  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  content.appendChild(header);
  content.appendChild(body);
  content.appendChild(footer);
  overlay.appendChild(content);

  const shell: ModalShell = { overlay, content, body, footer, onClose: null };

  closeBtn.addEventListener('click', () => {
    cleanup(overlay);
    shell.onClose?.();
  });

  // Close on backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      cleanup(overlay);
      shell.onClose?.();
    }
  });

  return shell;
}

function createButton(text: string, className: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn ${className}`;
  btn.textContent = text;
  return btn;
}

function cleanup(overlay: HTMLElement): void {
  overlay.remove();
}
