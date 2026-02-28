/**
 * Unit tests for textFormat module
 */

import { describe, it, expect } from 'vitest';
import {
  wordWrap,
  formatItemName,
  withArticle,
  copperToDenominationCounts,
  formatCopperAsDenominations,
} from './textFormat.js';

describe('wordWrap', () => {
  it('returns empty string for empty input', () => {
    expect(wordWrap('')).toBe('');
  });

  it('returns empty string for null-ish input', () => {
    expect(wordWrap(undefined as unknown as string)).toBe('');
  });

  it('returns text unchanged when shorter than width', () => {
    expect(wordWrap('Hello world', 80)).toBe('Hello world');
  });

  it('wraps long text at word boundaries', () => {
    const text = 'The quick brown fox jumps over the lazy dog near the river bank';
    const result = wordWrap(text, 30);
    const lines = result.split('\r\n');
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(30);
    }
    // Recombined text should match original words
    expect(result.replace(/\r\n/g, ' ')).toBe(text);
  });

  it('preserves existing line breaks', () => {
    const text = 'Line one\r\nLine two\r\nLine three';
    expect(wordWrap(text, 80)).toBe('Line one\r\nLine two\r\nLine three');
  });

  it('handles single long word exceeding width', () => {
    const longWord = 'abcdefghijklmnopqrstuvwxyz';
    const result = wordWrap(longWord, 10);
    // Single word can't be split, so it stays on one line
    expect(result).toBe(longWord);
  });

  it('uses \\r\\n for line endings', () => {
    const text = 'This is a somewhat longer line that should definitely be wrapped at the specified width boundary';
    const result = wordWrap(text, 40);
    expect(result).toContain('\r\n');
    expect(result).not.toContain('\n\r');
  });

  it('trims leading/trailing whitespace from paragraphs', () => {
    const text = '  Hello world  ';
    expect(wordWrap(text, 80)).toBe('Hello world');
  });

  it('handles mixed \\n and \\r\\n line endings in input', () => {
    const text = 'Line one\nLine two\r\nLine three';
    const result = wordWrap(text, 80);
    expect(result).toBe('Line one\r\nLine two\r\nLine three');
  });
});

describe('formatItemName', () => {
  it('converts to lowercase', () => {
    expect(formatItemName('Iron Sword')).toBe('iron sword');
  });

  it('returns empty string for empty input', () => {
    expect(formatItemName('')).toBe('');
  });
});

describe('withArticle', () => {
  it('adds "a" before consonant words', () => {
    expect(withArticle('sword')).toBe('a sword');
    expect(withArticle('rusty sword')).toBe('a rusty sword');
  });

  it('adds "an" before vowel words', () => {
    expect(withArticle('iron sword')).toBe('an iron sword');
    expect(withArticle('apple')).toBe('an apple');
    expect(withArticle('emerald ring')).toBe('an emerald ring');
  });

  it('does not double-add articles', () => {
    expect(withArticle('a sword')).toBe('a sword');
    expect(withArticle('an iron sword')).toBe('an iron sword');
    expect(withArticle('the crown')).toBe('the crown');
    expect(withArticle('some gold coins')).toBe('some gold coins');
  });

  it('returns empty string for empty/whitespace input', () => {
    expect(withArticle('')).toBe('');
    expect(withArticle('   ')).toBe('');
  });

  it('preserves original casing', () => {
    expect(withArticle('Excalibur')).toBe('an Excalibur');
  });
});

describe('copperToDenominationCounts', () => {
  it('returns empty map for 0 copper', () => {
    const result = copperToDenominationCounts(0);
    expect(result.size).toBe(0);
  });

  it('returns empty map for negative copper', () => {
    const result = copperToDenominationCounts(-5);
    expect(result.size).toBe(0);
  });

  it('converts exact copper amount', () => {
    const result = copperToDenominationCounts(5);
    expect(result.get('copper')).toBe(5);
    expect(result.size).toBe(1);
  });

  it('converts to silver and copper', () => {
    const result = copperToDenominationCounts(25);
    expect(result.get('silver')).toBe(2);
    expect(result.get('copper')).toBe(5);
  });

  it('converts to gold, silver, and copper', () => {
    const result = copperToDenominationCounts(234);
    expect(result.get('gold')).toBe(2);
    expect(result.get('silver')).toBe(3);
    expect(result.get('copper')).toBe(4);
  });

  it('converts to platinum', () => {
    const result = copperToDenominationCounts(1500);
    expect(result.get('platinum')).toBe(1);
    expect(result.get('gold')).toBe(5);
    expect(result.has('silver')).toBe(false);
    expect(result.has('copper')).toBe(false);
  });

  it('converts to runic', () => {
    const result = copperToDenominationCounts(200000);
    expect(result.get('runic')).toBe(2);
    expect(result.size).toBe(1);
  });

  it('handles large mixed amounts', () => {
    // 1 runic + 2 platinum + 3 gold + 4 silver + 5 copper
    const amount = 100000 + 2000 + 300 + 40 + 5;
    const result = copperToDenominationCounts(amount);
    expect(result.get('runic')).toBe(1);
    expect(result.get('platinum')).toBe(2);
    expect(result.get('gold')).toBe(3);
    expect(result.get('silver')).toBe(4);
    expect(result.get('copper')).toBe(5);
  });

  it('respects allowedDenominations filter', () => {
    // 250 copper with only copper+silver allowed
    const result = copperToDenominationCounts(250, ['copper', 'silver']);
    expect(result.get('silver')).toBe(25);
    expect(result.has('gold')).toBe(false);
    expect(result.has('copper')).toBe(false); // Exactly divisible
  });

  it('always includes copper as fallback', () => {
    // 15 copper with only gold allowed — gold needs 100, so falls through to copper
    const result = copperToDenominationCounts(15, ['gold']);
    expect(result.get('copper')).toBe(15);
    expect(result.has('gold')).toBe(false);
  });

  it('rolls disallowed denomination value down to next allowed tier', () => {
    // 150 copper with only silver+copper allowed (no gold)
    const result = copperToDenominationCounts(150, ['silver', 'copper']);
    expect(result.get('silver')).toBe(15);
    expect(result.has('gold')).toBe(false);
    expect(result.has('copper')).toBe(false);
  });

  it('floors fractional copper', () => {
    const result = copperToDenominationCounts(5.9);
    expect(result.get('copper')).toBe(5);
  });
});

describe('formatCopperAsDenominations', () => {
  it('returns "0 copper" for 0', () => {
    expect(formatCopperAsDenominations(0)).toBe('0 copper');
  });

  it('returns "0 copper" for negative', () => {
    expect(formatCopperAsDenominations(-10)).toBe('0 copper');
  });

  it('formats single denomination', () => {
    expect(formatCopperAsDenominations(5)).toBe('5 copper');
    expect(formatCopperAsDenominations(100)).toBe('1 gold');
  });

  it('formats multiple denominations in order', () => {
    expect(formatCopperAsDenominations(234)).toBe('2 gold, 3 silver, 4 copper');
  });

  it('skips zero denominations', () => {
    // 1 gold 0 silver 5 copper
    expect(formatCopperAsDenominations(105)).toBe('1 gold, 5 copper');
  });

  it('respects allowedDenominations', () => {
    expect(formatCopperAsDenominations(150, ['silver', 'copper'])).toBe('15 silver');
  });

  it('formats large amounts correctly', () => {
    expect(formatCopperAsDenominations(100000)).toBe('1 runic');
  });
});
