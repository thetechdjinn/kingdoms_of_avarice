/** Escape HTML special characters to prevent XSS in innerHTML assignments. */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
