import { describe, it, expect } from 'vitest';
import { CUSUM } from '../src/cusum.js';

describe('CUSUM', () => {
  it('detects gradual upward drift', () => {
    const cusum = new CUSUM({ slack: 0.5, threshold: 5, target: 10 });

    // Establish normal baseline
    for (let i = 0; i < 10; i++) {
      cusum.update(10);
    }
    expect(cusum.isAnomaly().isAnomaly).toBe(false);

    // Introduce gradual upward drift
    for (let i = 0; i < 50; i++) {
      cusum.update(12); // consistently above target by 2
    }

    const result = cusum.isAnomaly();
    expect(result.isAnomaly).toBe(true);
    expect(result.direction).toBe('up');
    expect(result.sHigh).toBeGreaterThan(5);
  });

  it('detects gradual downward drift', () => {
    const cusum = new CUSUM({ slack: 0.5, threshold: 5, target: 10 });

    // Establish normal baseline
    for (let i = 0; i < 10; i++) {
      cusum.update(10);
    }
    expect(cusum.isAnomaly().isAnomaly).toBe(false);

    // Introduce gradual downward drift
    for (let i = 0; i < 50; i++) {
      cusum.update(8); // consistently below target by 2
    }

    const result = cusum.isAnomaly();
    expect(result.isAnomaly).toBe(true);
    expect(result.direction).toBe('down');
    expect(result.sLow).toBeGreaterThan(5);
  });

  it('does not flag values near the target', () => {
    const cusum = new CUSUM({ slack: 0.5, threshold: 5, target: 10 });

    // Feed values very close to the target
    for (let i = 0; i < 50; i++) {
      cusum.update(10 + (Math.random() - 0.5) * 0.2);
    }

    const result = cusum.isAnomaly();
    expect(result.isAnomaly).toBe(false);
    expect(result.direction).toBe('none');
  });

  it('requires minimum sample count before flagging', () => {
    const cusum = new CUSUM({ slack: 0.5, threshold: 5, target: 10 });

    // Only 5 samples — below the 10-sample minimum
    for (let i = 0; i < 5; i++) {
      cusum.update(100); // very far from target
    }

    const result = cusum.isAnomaly();
    expect(result.isAnomaly).toBe(false);
  });

  it('reset clears cumulative sums but preserves count', () => {
    const cusum = new CUSUM({ slack: 0.5, threshold: 5, target: 10 });

    // Build up some drift
    for (let i = 0; i < 20; i++) {
      cusum.update(15);
    }

    const beforeReset = cusum.isAnomaly();
    expect(beforeReset.sHigh).toBeGreaterThan(0);

    cusum.reset();

    const afterReset = cusum.isAnomaly();
    expect(afterReset.sHigh).toBe(0);
    expect(afterReset.sLow).toBe(0);
    // Count is preserved (reset only clears cumulative sums)
    expect(cusum.getCount()).toBe(20);
  });

  it('auto-detects target from first value when no target specified', () => {
    const cusum = new CUSUM({ slack: 0.5, threshold: 5 });

    // First value sets target
    cusum.update(10);

    // Subsequent values near 10 should be fine
    for (let i = 1; i < 15; i++) {
      cusum.update(10);
    }
    expect(cusum.isAnomaly().isAnomaly).toBe(false);

    // Drift away from auto-detected target
    for (let i = 0; i < 30; i++) {
      cusum.update(15);
    }
    expect(cusum.isAnomaly().isAnomaly).toBe(true);
  });

  it('reports correct count', () => {
    const cusum = new CUSUM();
    expect(cusum.getCount()).toBe(0);
    cusum.update(1);
    expect(cusum.getCount()).toBe(1);
    cusum.update(2);
    cusum.update(3);
    expect(cusum.getCount()).toBe(3);
  });

  it('uses slack to tolerate small deviations', () => {
    const cusum = new CUSUM({ slack: 2, threshold: 5, target: 10 });

    // Deviations within slack should be absorbed
    for (let i = 0; i < 50; i++) {
      cusum.update(11.5); // deviation of 1.5, below slack of 2
    }

    const result = cusum.isAnomaly();
    expect(result.isAnomaly).toBe(false);
  });

  describe('serialization', () => {
    it('toJSON returns all state', () => {
      const cusum = new CUSUM({ slack: 1, threshold: 8, target: 5 });
      for (let i = 0; i < 20; i++) {
        cusum.update(i);
      }

      const json = cusum.toJSON();
      expect(json.target).toBe(5);
      expect(json.slack).toBe(1);
      expect(json.threshold).toBe(8);
      expect(json.count).toBe(20);
      expect(typeof json.sHigh).toBe('number');
      expect(typeof json.sLow).toBe('number');
    });

    it('fromJSON restores state correctly', () => {
      const original = new CUSUM({ slack: 0.8, threshold: 6, target: 10 });
      for (let i = 0; i < 25; i++) {
        original.update(10 + i * 0.1);
      }

      const json = original.toJSON();
      const restored = CUSUM.fromJSON(json);

      // Both should produce the same anomaly result
      const origResult = original.isAnomaly();
      const restoredResult = restored.isAnomaly();
      expect(restoredResult.isAnomaly).toBe(origResult.isAnomaly);
      expect(restoredResult.direction).toBe(origResult.direction);
      expect(restoredResult.sHigh).toBeCloseTo(origResult.sHigh, 10);
      expect(restoredResult.sLow).toBeCloseTo(origResult.sLow, 10);
      expect(restored.getCount()).toBe(original.getCount());
    });

    it('roundtrip preserves behavior', () => {
      const c1 = new CUSUM({ slack: 0.5, threshold: 5, target: 10 });
      for (let i = 0; i < 15; i++) {
        c1.update(10);
      }

      const c2 = CUSUM.fromJSON(c1.toJSON());

      // Feed the same new value to both
      c1.update(15);
      c2.update(15);

      const r1 = c1.isAnomaly();
      const r2 = c2.isAnomaly();
      expect(r2.sHigh).toBeCloseTo(r1.sHigh, 10);
      expect(r2.sLow).toBeCloseTo(r1.sLow, 10);
    });
  });

  it('handles zero target explicitly set', () => {
    // When target is explicitly 0, the first value should NOT override it
    const cusum = new CUSUM({ target: 0, slack: 0.5, threshold: 5 });
    cusum.update(5);
    // sHigh should accumulate because value is above target of 0
    // After 1 sample, count < 10, so isAnomaly is false but internally it should accumulate
    for (let i = 1; i < 15; i++) {
      cusum.update(5);
    }
    const result = cusum.isAnomaly();
    expect(result.isAnomaly).toBe(true);
    expect(result.direction).toBe('up');
  });
});
