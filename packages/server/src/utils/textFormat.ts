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
