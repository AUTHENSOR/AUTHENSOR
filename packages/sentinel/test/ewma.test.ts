import { describe, it, expect } from 'vitest';
import { EWMA } from '../src/ewma.js';

describe('EWMA', () => {
  it('tracks mean correctly for constant values', () => {
    const ewma = new EWMA(0.3);
    for (let i = 0; i < 50; i++) {
      ewma.update(10);
    }
    expect(ewma.getMean()).toBeCloseTo(10, 5);
    expect(ewma.getStdDev()).toBeCloseTo(0, 5);
  });

  it('adapts to new values', () => {
    const ewma = new EWMA(0.3);

    // Feed a baseline of 10
    for (let i = 0; i < 20; i++) {
      ewma.update(10);
    }
    expect(ewma.getMean()).toBeCloseTo(10, 1);

    // Shift to 20
    for (let i = 0; i < 50; i++) {
      ewma.update(20);
    }
    // After many updates at 20, the mean should converge towards 20
    expect(ewma.getMean()).toBeCloseTo(20, 0);
  });

  it('detects sudden spikes as anomalies', () => {
    const ewma = new EWMA(0.3);

    // Establish a stable baseline around 5
    for (let i = 0; i < 30; i++) {
      ewma.update(5 + Math.random() * 0.1);
    }

    // A value of 50 should be flagged as anomalous
    const result = ewma.isAnomaly(50);
    expect(result.isAnomaly).toBe(true);
    expect(result.deviation).toBeGreaterThan(3);
  });

  it('does not flag normal values as anomalies', () => {
    const ewma = new EWMA(0.3);

    // Establish baseline around 5 with slight natural variance
    for (let i = 0; i < 30; i++) {
      ewma.update(5 + (i % 3) * 0.1); // values: 5.0, 5.1, 5.2, repeating
    }

    // A value near the mean should not be anomalous
    const result = ewma.isAnomaly(5.1);
    expect(result.isAnomaly).toBe(false);
  });

  it('requires minimum sample count before flagging anomalies', () => {
    const ewma = new EWMA(0.3);

    // Only 5 samples — below the 10-sample minimum
    for (let i = 0; i < 5; i++) {
      ewma.update(5);
    }

    const result = ewma.isAnomaly(100);
    expect(result.isAnomaly).toBe(false);
    expect(result.deviation).toBe(0);
  });

  it('handles zero standard deviation correctly', () => {
    const ewma = new EWMA(0.3);

    // All identical values => stddev = 0
    for (let i = 0; i < 15; i++) {
      ewma.update(7);
    }

    // Same value: not anomalous
    const same = ewma.isAnomaly(7);
    expect(same.isAnomaly).toBe(false);
    expect(same.deviation).toBe(0);

    // Different value with zero stddev: anomalous with Infinity deviation
    const diff = ewma.isAnomaly(8);
    expect(diff.isAnomaly).toBe(true);
    expect(diff.deviation).toBe(Infinity);
  });

  it('clamps alpha to valid range', () => {
    const tooLow = new EWMA(-1);
    tooLow.update(10);
    tooLow.update(20);
    // Should not throw; alpha is clamped to 0.01
    expect(tooLow.getMean()).toBeGreaterThan(10);

    const tooHigh = new EWMA(5);
    tooHigh.update(10);
    tooHigh.update(20);
    // Alpha clamped to 0.99
    expect(tooHigh.getMean()).toBeCloseTo(20, 0);
  });

  it('reports correct count', () => {
    const ewma = new EWMA();
    expect(ewma.getCount()).toBe(0);
    ewma.update(1);
    expect(ewma.getCount()).toBe(1);
    ewma.update(2);
    ewma.update(3);
    expect(ewma.getCount()).toBe(3);
  });

  describe('serialization', () => {
    it('toJSON returns all state', () => {
      const ewma = new EWMA(0.5);
      for (let i = 0; i < 20; i++) {
        ewma.update(i);
      }
      const json = ewma.toJSON();
      expect(json.alpha).toBe(0.5);
      expect(json.count).toBe(20);
      expect(typeof json.mean).toBe('number');
      expect(typeof json.variance).toBe('number');
    });

    it('fromJSON restores state correctly', () => {
      const original = new EWMA(0.4);
      for (let i = 0; i < 25; i++) {
        original.update(i * 2);
      }

      const json = original.toJSON();
      const restored = EWMA.fromJSON(json);

      expect(restored.getMean()).toBeCloseTo(original.getMean(), 10);
      expect(restored.getStdDev()).toBeCloseTo(original.getStdDev(), 10);
      expect(restored.getCount()).toBe(original.getCount());

      // Both should give the same anomaly result for the same input
      const origResult = original.isAnomaly(100);
      const restoredResult = restored.isAnomaly(100);
      expect(restoredResult.isAnomaly).toBe(origResult.isAnomaly);
      expect(restoredResult.deviation).toBeCloseTo(origResult.deviation, 10);
    });

    it('roundtrip preserves behavior', () => {
      const ewma1 = new EWMA(0.3);
      for (let i = 0; i < 15; i++) {
        ewma1.update(10);
      }

      const ewma2 = EWMA.fromJSON(ewma1.toJSON());

      // Feed the same new value to both
      ewma1.update(15);
      ewma2.update(15);

      expect(ewma2.getMean()).toBeCloseTo(ewma1.getMean(), 10);
      expect(ewma2.getStdDev()).toBeCloseTo(ewma1.getStdDev(), 10);
    });
  });

  it('first update sets mean to value', () => {
    const ewma = new EWMA(0.3);
    ewma.update(42);
    expect(ewma.getMean()).toBe(42);
    expect(ewma.getStdDev()).toBe(0);
  });

  it('tracks variance with noisy data', () => {
    const ewma = new EWMA(0.3);
    // Feed alternating high and low values
    for (let i = 0; i < 50; i++) {
      ewma.update(i % 2 === 0 ? 10 : 20);
    }
    // Variance should be non-zero due to oscillation
    expect(ewma.getStdDev()).toBeGreaterThan(0);
    // Mean should be somewhere between 10 and 20
    expect(ewma.getMean()).toBeGreaterThan(10);
    expect(ewma.getMean()).toBeLessThan(20);
  });
});
