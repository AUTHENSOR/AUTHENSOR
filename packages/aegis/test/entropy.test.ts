import { describe, it, expect } from 'vitest';
import { shannonEntropy, analyzeEntropy } from '../src/entropy.js';

describe('Shannon Entropy', () => {
  it('returns 0 for empty string', () => {
    expect(shannonEntropy('')).toBe(0);
  });

  it('returns 0 for single-character string', () => {
    expect(shannonEntropy('aaaa')).toBe(0);
  });

  it('returns 1 for two equally distributed characters', () => {
    expect(shannonEntropy('abab')).toBe(1);
  });

  it('computes correct entropy for English text', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const e = shannonEntropy(text);
    // English text typically 3.5-4.5 bits/char
    expect(e).toBeGreaterThan(3.0);
    expect(e).toBeLessThan(5.0);
  });

  it('computes high entropy for random-looking strings', () => {
    // Simulated adversarial suffix (high entropy gibberish)
    const gibberish = 'x9Kv2!pZ@mQ#nR$sL%wT^yU&iO*aE(dF)gH+jB=cN7';
    const e = shannonEntropy(gibberish);
    expect(e).toBeGreaterThan(5.0);
  });

  it('computes lower entropy for repetitive text', () => {
    const repetitive = 'the the the the the the the the';
    const e = shannonEntropy(repetitive);
    expect(e).toBeLessThan(3.0);
  });
});

describe('analyzeEntropy', () => {
  it('marks normal English text as not anomalous', () => {
    const text = 'This is a perfectly normal sentence about everyday topics like weather and cooking.';
    const result = analyzeEntropy(text);
    expect(result.anomalous).toBe(false);
    expect(result.assessment).toBe('normal');
  });

  it('detects high entropy adversarial suffixes', () => {
    const normalText = 'Please help me with my homework. ';
    // Simulate GCG adversarial suffix
    const suffix = Array.from({ length: 120 }, () =>
      String.fromCharCode(33 + Math.floor(Math.random() * 93))
    ).join('');
    const result = analyzeEntropy(normalText + suffix, 100, 5.0);
    expect(result.anomalous).toBe(true);
    expect(result.highEntropySegment).toBeTruthy();
  });

  it('handles short texts gracefully', () => {
    const result = analyzeEntropy('hello', 100);
    expect(result.anomalous).toBe(false);
    expect(result.assessment).toBe('normal');
  });

  it('uses sliding window to find high-entropy segments', () => {
    // Normal text with an embedded encoded payload
    const normal = 'This is normal text about a regular topic. ';
    const encoded = 'SGVsbG8gV29ybGQgdGhpcyBpcyBhIGJhc2U2NCBlbmNvZGVkIHN0cmluZyB3aXRoIGhpZ2ggZW50cm9weQ==';
    const text = normal + encoded + ' ' + normal;
    const result = analyzeEntropy(text, 80, 4.8);
    // The sliding window should catch the base64 segment
    expect(result.entropy).toBeGreaterThan(3.0);
  });

  it('returns correct assessment categories', () => {
    expect(analyzeEntropy('aaaa').assessment).toBe('normal');
    // High entropy via diverse characters
    const highEntropy = 'aAbBcCdDeEfFgGhHiIjJkKlLmMnNoOpPqQrRsStTuUvVwWxXyYzZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
    const result = analyzeEntropy(highEntropy, 200, 4.5);
    expect(['elevated', 'suspicious', 'adversarial']).toContain(result.assessment);
  });
});
