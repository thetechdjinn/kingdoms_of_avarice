/**
 * Text formatting utilities for MUD output
 */

import type { CurrencyDenomination } from '@koa/shared';
import { CURRENCY_DENOMINATIONS } from '@koa/shared';

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
 * Format an NPC/entity name for use in prose.
 * Common nouns get "a"/"an" prefix; proper nouns pass through unchanged.
 */
export function withNpcName(name: string, isProperName: boolean): string {
  return isProperName ? name : withArticle(name);
}

/**
 * Format an NPC/entity name in possessive form for prose.
 * Common nouns get "The" prefix; proper nouns pass through unchanged.
 * E.g., "Goran's Wares" vs "The serpentine warrior's Wares"
 */
export function withNpcNamePossessive(name: string, isProperName: boolean): string {
  return isProperName ? `${name}'s` : `The ${name}'s`;
}

/**
 * Format an NPC/entity name with capitalized article for sentence start.
 * Common nouns get "A"/"An" or "The" prefix; proper nouns pass through unchanged.
 */
export function withNpcNameCapitalized(name: string, isProperName: boolean): string {
  if (isProperName) return name;
  const article = withArticle(name);
  return article.charAt(0).toUpperCase() + article.slice(1);
}

/**
 * Format an NPC/entity name with "The" prefix for sentence start.
 * Common nouns get "The" prefix; proper nouns pass through unchanged.
 */
export function withNpcNameThe(name: string, isProperName: boolean): string {
  return isProperName ? name : `The ${name}`;
}

/** Copper value of each denomination (ordered highest to lowest) */
const DENOMINATION_VALUES: { denom: CurrencyDenomination; value: number }[] = [
  { denom: 'runic', value: 100000 },
  { denom: 'platinum', value: 1000 },
  { denom: 'gold', value: 100 },
  { denom: 'silver', value: 10 },
  { denom: 'copper', value: 1 },
];

/**
 * Convert a copper amount into denomination coin counts.
 * Skips disallowed denominations (value rolls down to the next allowed tier).
 * Copper is always implicitly allowed as a final fallback so no value is lost.
 *
 * @param copper - Total value in copper farthings
 * @param allowedDenominations - Which denominations may be produced (default: all)
 * @returns Map of denomination → coin count (only non-zero entries)
 */
export function copperToDenominationCounts(
  copper: number,
  allowedDenominations?: readonly CurrencyDenomination[]
): Map<CurrencyDenomination, number> {
  const result = new Map<CurrencyDenomination, number>();
  if (copper <= 0) return result;

  // Always include copper as fallback so no value is silently lost
  const allowed = new Set<CurrencyDenomination>(allowedDenominations ?? CURRENCY_DENOMINATIONS);
  allowed.add('copper');

  let remaining = Math.floor(copper);

  for (const { denom, value } of DENOMINATION_VALUES) {
    if (!allowed.has(denom)) continue;
    const count = Math.floor(remaining / value);
    if (count > 0) {
      result.set(denom, count);
      remaining %= value;
    }
  }

  return result;
}

/**
 * Format a copper-denominated amount into a human-readable denomination string.
 * Conversion rates: 10 copper = 1 silver, 10 silver = 1 gold,
 * 10 gold = 1 platinum, 100 platinum = 1 runic.
 *
 * @param copper - Total value in copper farthings
 * @param allowedDenominations - Which denominations to include (default: all)
 * @returns Formatted string like "2 gold, 4 silver, 5 copper"
 */
export function formatCopperAsDenominations(
  copper: number,
  allowedDenominations?: readonly CurrencyDenomination[]
): string {
  if (copper <= 0) return '0 copper';

  const counts = copperToDenominationCounts(copper, allowedDenominations);

  const parts: string[] = [];
  // Iterate in highest-to-lowest order
  for (const { denom } of DENOMINATION_VALUES) {
    const count = counts.get(denom);
    if (count && count > 0) {
      parts.push(`${count} ${denom}`);
    }
  }

  return parts.length > 0 ? parts.join(', ') : '0 copper';
}
