/**
 * Text formatting utilities for MUD output
 */

import type { CurrencyDenomination } from '@koa/shared';
import { CURRENCY_DENOMINATIONS } from '@koa/shared';
import { colors } from './colors.js';

/** Regex matching ANSI escape sequences (zero visual width in terminal) */
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

/**
 * Return the visual width of a string, excluding ANSI escape codes.
 */
export function visualLength(text: string): number {
  return text.replace(ANSI_REGEX, '').length;
}

/**
 * Word wrap text to a specified width without splitting words.
 * - ANSI-aware: escape codes don't count toward line width
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

    if (visualLength(paragraph) <= width) {
      return paragraph;
    }

    // Split into tokens preserving ANSI codes attached to adjacent words.
    // We split on whitespace boundaries but keep ANSI codes glued to words.
    const words = paragraph.split(/(\s+)/).filter(t => t.length > 0 && !/^\s+$/.test(t));
    const lines: string[] = [];
    let currentLine = '';
    let currentVisual = 0;

    for (const word of words) {
      const wordVisual = visualLength(word);
      if (currentVisual === 0) {
        // First word on line
        currentLine = word;
        currentVisual = wordVisual;
      } else if (currentVisual + 1 + wordVisual <= width) {
        // Word fits on current line
        currentLine += ' ' + word;
        currentVisual += 1 + wordVisual;
      } else {
        // Word doesn't fit, start new line
        lines.push(currentLine);
        currentLine = word;
        currentVisual = wordVisual;
      }
    }

    // Don't forget the last line
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    return fixAnsiLineBreaks(lines).join('\r\n');
  });

  return wrappedParagraphs.join('\r\n');
}

const ANSI_RESET = '\x1b[0m';

/**
 * Ensure ANSI color codes don't bleed across wrapped lines.
 * If a line ends with active styles, appends a reset and re-opens them
 * on the next line so each line is self-contained.
 * Tracks all active SGR codes (e.g., bold+cyan) not just the last one.
 */
function fixAnsiLineBreaks(lines: string[]): string[] {
  if (lines.length <= 1) return lines;

  const result: string[] = [];
  let activeCodes: string[] = [];

  for (const line of lines) {
    const processedLine: string = activeCodes.length > 0 ? activeCodes.join('') + line : line;

    // Walk only the ORIGINAL line's ANSI codes (not prepended ones) to update state
    const currentCodes: string[] = [];
    let hadReset = false;
    const matches = Array.from(line.matchAll(ANSI_REGEX));
    for (const match of matches) {
      if (!match) continue;
      const params = match[0].slice(2, -1); // strip \x1b[ and m
      if (params === '0' || params === '') {
        currentCodes.length = 0;
        hadReset = true;
      } else {
        currentCodes.push(match[0]);
      }
    }

    // Merge: if the line had a reset, only its new codes survive.
    // Otherwise, carry forward previous codes plus any new ones, deduplicated.
    let endCodes: string[];
    if (hadReset) {
      endCodes = currentCodes;
    } else if (currentCodes.length === 0) {
      endCodes = activeCodes;
    } else {
      // Deduplicate: new codes of the same type replace old ones
      const merged = new Map<string, string>();
      for (const code of activeCodes) merged.set(code, code);
      for (const code of currentCodes) merged.set(code, code);
      endCodes = [...merged.values()];
    }

    // If there are active styles at end of line, close them
    result.push(endCodes.length > 0 ? processedLine + ANSI_RESET : processedLine);
    activeCodes = endCodes;
  }

  return result;
}

/**
 * Word wrap text for quest/NPC dialogue with left indent.
 * Creates a visually distinct "quoted speech" block, narrower than standard
 * output and indented from the left margin.
 *
 * @param text - The text to wrap (may contain ANSI codes)
 * @param indent - Number of spaces to indent from left (default 4)
 * @param contentWidth - Max width of text content (default 70)
 * @returns Wrapped and indented text with \r\n line endings
 */
export function dialogueWrap(text: string, indent: number = 4, contentWidth: number = 70): string {
  if (!text) return '';
  const wrapped = wordWrap(text, contentWidth);
  const pad = ' '.repeat(indent);
  return wrapped.split('\r\n').map(line => pad + line).join('\r\n');
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
export function withNpcNamePossessive(name: string, isProperName: boolean, capitalize: boolean = true): string {
  if (isProperName) return `${name}'s`;
  return capitalize ? `The ${name}'s` : `the ${name}'s`;
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

/**
 * Map of color tag names to their ANSI color functions.
 * Tag names are lowercase for case-insensitive matching.
 */
const COLOR_TAG_MAP: Record<string, (text: string) => string> = {
  red: colors.red,
  green: colors.green,
  yellow: colors.brightYellow,
  blue: colors.blue,
  magenta: colors.magenta,
  cyan: colors.cyan,
  white: colors.white,
  brightred: colors.brightRed,
  brightgreen: colors.brightGreen,
  brightyellow: colors.brightYellow,
  brightblue: colors.brightBlue,
  brightcyan: colors.brightCyan,
  brightwhite: colors.brightWhite,
  gray: colors.gray,
  grey: colors.grey,
  gold: colors.gold,
  bold: colors.boldWhite,
  boldcyan: colors.boldCyan,
  boldgreen: colors.boldGreen,
  boldyellow: colors.boldYellow,
  boldred: colors.boldRed,
  boldwhite: colors.boldWhite,
  item: colors.item,
  npc: colors.npc,
  player: colors.player,
  system: colors.system,
  error: colors.error,
  location: colors.cyan,
};

/** Regex matching {colorName} or {/} tags */
const COLOR_TAG_REGEX = /\{(\/|[a-zA-Z]+)\}/g;

/**
 * Parse {color}text{/} markup into ANSI-colored output.
 * Untagged text uses the provided base color function.
 * Unrecognized tag names are left as literal text.
 *
 * Variable substitution: pass a variables map to replace {varName} tokens
 * before color processing. Variables are checked first; if a tag matches
 * a variable name it is replaced with the value, not treated as a color.
 *
 * @param text - Text with color markup tags
 * @param baseColorFn - Color function for untagged text (default: colors.green)
 * @param variables - Optional map of variable names to replacement values (e.g., { name: 'Aldric' })
 * @returns ANSI-colored string
 */
export function renderColorMarkup(
  text: string,
  baseColorFn: (t: string) => string = colors.green,
  variables?: Record<string, string>
): string {
  if (!text) return '';

  // Variable substitution pass (before color parsing)
  // Escape braces in values so they aren't interpreted as color tags
  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      const safeValue = value.replace(/\{/g, '\u200B{');
      text = text.split(`{${key}}`).join(safeValue);
    }
  }

  const segments: string[] = [];
  let lastIndex = 0;
  let activeColorFn: ((t: string) => string) | null = null;

  for (const match of text.matchAll(COLOR_TAG_REGEX)) {
    const tagName = match[1];
    const matchStart = match.index;

    // Flush text before this tag
    if (matchStart > lastIndex) {
      const chunk = text.slice(lastIndex, matchStart);
      segments.push(activeColorFn ? activeColorFn(chunk) : baseColorFn(chunk));
    }

    if (tagName === '/') {
      // Close tag: revert to base color
      activeColorFn = null;
    } else {
      const colorFn = COLOR_TAG_MAP[tagName.toLowerCase()];
      if (colorFn) {
        // Valid color: activate it
        activeColorFn = colorFn;
      } else {
        // Unrecognized tag: leave as literal text
        const literal = match[0];
        segments.push(activeColorFn ? activeColorFn(literal) : baseColorFn(literal));
      }
    }

    lastIndex = matchStart + match[0].length;
  }

  // Flush remaining text after last tag
  if (lastIndex < text.length) {
    const chunk = text.slice(lastIndex);
    segments.push(activeColorFn ? activeColorFn(chunk) : baseColorFn(chunk));
  }

  return segments.join('');
}
