/**
 * Text formatting utilities for MUD output
 */

/**
 * Word wrap text to a specified width without splitting words.
 * - Does not split words mid-word
 * - Does not leave leading spaces on wrapped lines
 * - Preserves intentional line breaks (\r\n or \n)
 * 
 * @param text - The text to wrap
 * @param width - Maximum line width (default 80)
 * @returns Wrapped text with \r\n line endings
 */
export function wordWrap(text: string, width: number = 80): string {
  if (!text) return '';
  
  // Split on existing line breaks first
  const paragraphs = text.split(/\r?\n/);
  
  const wrappedParagraphs = paragraphs.map(paragraph => {
    // Trim the paragraph
    paragraph = paragraph.trim();
    
    if (paragraph.length <= width) {
      return paragraph;
    }
    
    const words = paragraph.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      if (currentLine.length === 0) {
        // First word on line
        currentLine = word;
      } else if (currentLine.length + 1 + word.length <= width) {
        // Word fits on current line
        currentLine += ' ' + word;
      } else {
        // Word doesn't fit, start new line
        lines.push(currentLine);
        currentLine = word;
      }
    }
    
    // Don't forget the last line
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
    
    return lines.join('\r\n');
  });
  
  return wrappedParagraphs.join('\r\n');
}

/**
 * Format item name to lowercase
 * @param name - Item name
 * @returns Lowercase name
 */
export function formatItemName(name: string): string {
  return name.toLowerCase();
}

/**
 * Add article (a/an) to a noun
 * @param noun - The noun to add article to
 * @returns Noun with appropriate article
 */
export function withArticle(noun: string): string {
  // Handle empty or whitespace-only input
  const trimmed = noun.trim();
  if (!trimmed) {
    return '';
  }
  
  const lower = trimmed.toLowerCase();
  
  // Already has an article
  if (lower.startsWith('a ') || lower.startsWith('an ') || 
      lower.startsWith('the ') || lower.startsWith('some ')) {
    return trimmed;
  }
  
  // Use "an" for vowel sounds
  const vowels = ['a', 'e', 'i', 'o', 'u'];
  const article = vowels.includes(lower[0]) ? 'an' : 'a';
  return `${article} ${trimmed}`;
}

/**
 * Format a copper-denominated amount into a human-readable denomination string.
 * Conversion rates: 10 copper = 1 silver, 10 silver = 1 gold,
 * 10 gold = 1 platinum, 100 platinum = 1 runic.
 *
 * @param copper - Total value in copper farthings
 * @returns Formatted string like "2 gold, 4 silver, 5 copper"
 */
export function formatCopperAsDenominations(copper: number): string {
  if (copper <= 0) return '0 copper';

  let remaining = Math.floor(copper);

  const runic = Math.floor(remaining / 100000);
  remaining %= 100000;
  const platinum = Math.floor(remaining / 1000);
  remaining %= 1000;
  const gold = Math.floor(remaining / 100);
  remaining %= 100;
  const silver = Math.floor(remaining / 10);
  remaining %= 10;
  const copperLeft = remaining;

  const parts: string[] = [];
  if (runic > 0) parts.push(`${runic} runic`);
  if (platinum > 0) parts.push(`${platinum} platinum`);
  if (gold > 0) parts.push(`${gold} gold`);
  if (silver > 0) parts.push(`${silver} silver`);
  if (copperLeft > 0) parts.push(`${copperLeft} copper`);

  return parts.length > 0 ? parts.join(', ') : '0 copper';
}
