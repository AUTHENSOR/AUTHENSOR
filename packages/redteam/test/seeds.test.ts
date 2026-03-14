import { describe, it, expect } from 'vitest';
import {
  getSeeds,
  getSeedsByCategory,
  getSeedById,
  getSeedsByTag,
  getSeedsByMitre,
  getCategorySummary,
  getAllTags,
  getAllMitreReferences,
  generateReport,
  ALL_SEEDS,
} from '../src/index.js';
import type { AttackCategory, SeedResult } from '../src/index.js';

describe('@authensor/redteam', () => {
  describe('seed library', () => {
    it('contains exactly 15 seeds', () => {
      expect(getSeeds()).toHaveLength(15);
    });

    it('all seeds have unique IDs', () => {
      const ids = getSeeds().map(s => s.id);
      expect(new Set(ids).size).toBe(15);
    });

    it('all seeds have required fields', () => {
      for (const seed of getSeeds()) {
        expect(seed.id).toBeTruthy();
        expect(seed.title).toBeTruthy();
        expect(seed.category).toBeTruthy();
        expect(seed.tags.length).toBeGreaterThan(0);
        expect(seed.hypothesis).toBeTruthy();
        expect(seed.instruction.length).toBeGreaterThan(100);
        expect(seed.systemPrompt).toBeTruthy();
        expect(seed.tools.length).toBeGreaterThan(0);
        expect(seed.mitre.length).toBeGreaterThan(0);
        expect(seed.dimensions.length).toBeGreaterThan(0);
        expect(seed.boundaryDefinition).toBeTruthy();
        expect(seed.minTurns).toBeGreaterThan(0);
        expect(seed.rubricScore).toBeGreaterThanOrEqual(30);
      }
    });

    it('covers all 5 attack categories', () => {
      const categories = new Set(getSeeds().map(s => s.category));
      expect(categories).toEqual(new Set([
        'social_engineering',
        'privilege_escalation',
        'anti_forensics',
        'sandbox_evasion',
        'insider_threat',
      ]));
    });

    it('has 3 seeds per category', () => {
      const summary = getCategorySummary();
      expect(summary.social_engineering).toBe(3);
      expect(summary.privilege_escalation).toBe(3);
      expect(summary.anti_forensics).toBe(3);
      expect(summary.sandbox_evasion).toBe(3);
      expect(summary.insider_threat).toBe(3);
    });
  });

  describe('getSeedsByCategory', () => {
    it('returns social engineering seeds', () => {
      const seeds = getSeedsByCategory('social_engineering');
      expect(seeds).toHaveLength(3);
      expect(seeds.map(s => s.id)).toContain('seed-001');
      expect(seeds.map(s => s.id)).toContain('seed-004');
      expect(seeds.map(s => s.id)).toContain('seed-005');
    });

    it('returns privilege escalation seeds', () => {
      const seeds = getSeedsByCategory('privilege_escalation');
      expect(seeds).toHaveLength(3);
      expect(seeds.map(s => s.id)).toContain('seed-003');
    });

    it('returns empty array for invalid category', () => {
      const seeds = getSeedsByCategory('nonexistent' as AttackCategory);
      expect(seeds).toHaveLength(0);
    });
  });

  describe('getSeedById', () => {
    it('returns seed by ID', () => {
      const seed = getSeedById('seed-001');
      expect(seed).toBeDefined();
      expect(seed!.title).toBe('Defense Contractor Compliance Drift');
    });

    it('returns undefined for unknown ID', () => {
      expect(getSeedById('seed-999')).toBeUndefined();
    });
  });

  describe('getSeedsByTag', () => {
    it('returns seeds with given tag', () => {
      const seeds = getSeedsByTag('deception');
      expect(seeds.length).toBeGreaterThan(0);
      for (const seed of seeds) {
        expect(seed.tags).toContain('deception');
      }
    });

    it('cooperation_with_misuse is the most common tag', () => {
      const coopSeeds = getSeedsByTag('cooperation_with_misuse');
      expect(coopSeeds.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('getSeedsByMitre', () => {
    it('finds seeds by MITRE technique ID', () => {
      const seeds = getSeedsByMitre('T1070');
      expect(seeds.length).toBeGreaterThan(0);
      expect(seeds[0].title).toBe('Log Tampering');
    });

    it('returns empty for unknown technique', () => {
      expect(getSeedsByMitre('T9999')).toHaveLength(0);
    });
  });

  describe('getAllTags', () => {
    it('returns sorted unique tags', () => {
      const tags = getAllTags();
      expect(tags.length).toBeGreaterThan(5);
      // Check sorted
      for (let i = 1; i < tags.length; i++) {
        expect(tags[i] >= tags[i - 1]).toBe(true);
      }
    });
  });

  describe('getAllMitreReferences', () => {
    it('returns MITRE references sorted by seed count', () => {
      const refs = getAllMitreReferences();
      expect(refs.length).toBeGreaterThan(5);
      for (let i = 1; i < refs.length; i++) {
        expect(refs[i].seedCount <= refs[i - 1].seedCount).toBe(true);
      }
    });
  });

  describe('generateReport', () => {
    it('generates a report from seed results', () => {
      const results: SeedResult[] = [
        {
          seedId: 'seed-001',
          boundaryCrossed: false,
          totalTurns: 40,
          dimensionScores: { compliance_momentum: 0.9, cooperation_with_human_misuse: 0.8 },
          transcript: [],
          evaluatedAt: Date.now(),
        },
        {
          seedId: 'seed-003',
          boundaryCrossed: true,
          crossingTurn: 18,
          totalTurns: 20,
          dimensionScores: { chain_awareness: 0.3, cooperation_with_human_misuse: 0.2 },
          transcript: [],
          evaluatedAt: Date.now(),
        },
      ];

      const report = generateReport('test-agent', results);
      expect(report.agentId).toBe('test-agent');
      expect(report.passRate).toBe(0.5);
      expect(report.results).toHaveLength(2);
      expect(report.generatedAt).toBeGreaterThan(0);
      expect(report.dimensionAverages.cooperation_with_human_misuse).toBe(0.5);
    });

    it('handles empty results', () => {
      const report = generateReport('empty-agent', []);
      expect(report.passRate).toBe(0);
      expect(report.results).toHaveLength(0);
    });
  });

  describe('seed quality', () => {
    it('all tools have names and descriptions', () => {
      for (const seed of ALL_SEEDS) {
        for (const tool of seed.tools) {
          expect(tool.name).toBeTruthy();
          expect(tool.description).toBeTruthy();
        }
      }
    });

    it('all MITRE references have IDs and names', () => {
      for (const seed of ALL_SEEDS) {
        for (const ref of seed.mitre) {
          expect(ref.id).toBeTruthy();
          expect(ref.name).toBeTruthy();
        }
      }
    });

    it('all dimensions have IDs and descriptions', () => {
      for (const seed of ALL_SEEDS) {
        for (const dim of seed.dimensions) {
          expect(dim.id).toBeTruthy();
          expect(dim.description).toBeTruthy();
        }
      }
    });

    it('instructions are substantial (>200 chars)', () => {
      for (const seed of ALL_SEEDS) {
        expect(seed.instruction.length).toBeGreaterThan(200);
      }
    });

    it('average rubric score is above 33', () => {
      const avg = ALL_SEEDS.reduce((sum, s) => sum + s.rubricScore, 0) / ALL_SEEDS.length;
      expect(avg).toBeGreaterThan(33);
    });
  });
});
