/**
 * Shannon Entropy Scorer
 *
 * Detects adversarial suffix injection (GCG-style attacks) by measuring
 * character-level entropy. Normal English text has ~3.5-4.5 bits/char.
 * Adversarial suffixes, encoded payloads, and random gibberish produce
 * entropy >5.5 bits/char.
 *
 * Research ranking: #5 zero-dependency detection technique.
 * Catches GCG adversarial suffixes that bypass keyword-based detectors.
 */

export interface EntropyResult {
  /** Shannon entropy in bits per character */
  entropy: number;
  /** Whether the entropy is anomalously high */
  anomalous: boolean;
  /** Human-readable assessment */
  assessment: 'normal' | 'elevated' | 'suspicious' | 'adversarial';
  /** If anomalous, the segment with highest entropy */
  highEntropySegment?: string;
}

/**
 * Calculate Shannon entropy of a string in bits per character.
 *
 * H = -Σ p(x) * log2(p(x)) for each unique character x
 */
export function shannonEntropy(text: string): number {
  if (text.length === 0) return 0;

  const freq = new Map<string, number>();
  for (const char of text) {
    freq.set(char, (freq.get(char) || 0) + 1);
  }

  let entropy = 0;
  const len = text.length;
  for (const count of freq.values()) {
    const p = count / len;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  return Math.round(entropy * 1000) / 1000;
}

/**
 * Analyze text for entropy anomalies.
 *
 * Uses a sliding window to detect high-entropy segments within
 * otherwise normal text (the typical GCG attack pattern: normal prompt
 * followed by adversarial gibberish suffix).
 *
 * @param text The text to analyze
 * @param windowSize Size of the sliding window in characters (default: 100)
 * @param threshold Entropy above this is considered anomalous (default: 5.0)
 */
export function analyzeEntropy(
  text: string,
  windowSize = 100,
  threshold = 5.0,
): EntropyResult {
  // Overall entropy
  const overall = shannonEntropy(text);

  // For short texts, just use overall entropy
  if (text.length <= windowSize) {
    return {
      entropy: overall,
      anomalous: overall > threshold,
      assessment: entropyAssessment(overall),
      highEntropySegment: overall > threshold ? text.slice(0, 200) : undefined,
    };
  }

  // Sliding window analysis — find the highest-entropy segment
  let maxWindowEntropy = 0;
  let maxWindowStart = 0;

  // Step by half-window for efficiency
  const step = Math.max(1, Math.floor(windowSize / 2));
  for (let i = 0; i <= text.length - windowSize; i += step) {
    const window = text.slice(i, i + windowSize);
    const windowEntropy = shannonEntropy(window);
    if (windowEntropy > maxWindowEntropy) {
      maxWindowEntropy = windowEntropy;
      maxWindowStart = i;
    }
  }

  const anomalous = maxWindowEntropy > threshold;

  return {
    entropy: overall,
    anomalous,
    assessment: entropyAssessment(maxWindowEntropy),
    highEntropySegment: anomalous
      ? text.slice(maxWindowStart, maxWindowStart + Math.min(windowSize, 200))
      : undefined,
  };
}

function entropyAssessment(entropy: number): EntropyResult['assessment'] {
  if (entropy <= 4.5) return 'normal';
  if (entropy <= 5.0) return 'elevated';
  if (entropy <= 5.5) return 'suspicious';
  return 'adversarial';
}
