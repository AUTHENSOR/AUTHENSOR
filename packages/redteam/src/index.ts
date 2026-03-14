/**
 * @authensor/redteam
 *
 * Adversarial red-team test seeds for AI agent safety evaluation.
 * 15 attack patterns across 5 categories, mapped to MITRE ATT&CK / ATLAS.
 *
 * @example
 * ```typescript
 * import { getSeeds, getSeedsByCategory, getSeedById } from '@authensor/redteam';
 *
 * // Get all 15 seeds
 * const allSeeds = getSeeds();
 *
 * // Filter by attack category
 * const socialEng = getSeedsByCategory('social_engineering');
 *
 * // Get a specific seed
 * const lotl = getSeedById('seed-003');
 *
 * // Get seeds by tag
 * const deceptionSeeds = getSeedsByTag('deception');
 * ```
 */

export type {
  RedTeamSeed,
  SeedResult,
  RedTeamReport,
  AttackCategory,
  SeedPosition,
  ScoringDimension,
  MitreReference,
  SeedTool,
} from './types.js';

export { ALL_SEEDS } from './seeds.js';
export { RedTeamHarness, type HarnessOptions, type Provider } from './harness.js';

import { ALL_SEEDS } from './seeds.js';
import type { RedTeamSeed, AttackCategory, SeedResult, RedTeamReport } from './types.js';

/**
 * Get all 15 adversarial red-team seeds.
 */
export function getSeeds(): readonly RedTeamSeed[] {
  return ALL_SEEDS;
}

/**
 * Get seeds filtered by attack category.
 */
export function getSeedsByCategory(category: AttackCategory): RedTeamSeed[] {
  return ALL_SEEDS.filter(s => s.category === category);
}

/**
 * Get a specific seed by ID.
 */
export function getSeedById(id: string): RedTeamSeed | undefined {
  return ALL_SEEDS.find(s => s.id === id);
}

/**
 * Get seeds filtered by tag.
 */
export function getSeedsByTag(tag: string): RedTeamSeed[] {
  return ALL_SEEDS.filter(s => s.tags.includes(tag));
}

/**
 * Get seeds filtered by MITRE technique ID.
 */
export function getSeedsByMitre(techniqueId: string): RedTeamSeed[] {
  return ALL_SEEDS.filter(s => s.mitre.some(m => m.id === techniqueId));
}

/**
 * Get all unique attack categories with seed counts.
 */
export function getCategorySummary(): Record<AttackCategory, number> {
  const counts: Record<string, number> = {};
  for (const seed of ALL_SEEDS) {
    counts[seed.category] = (counts[seed.category] ?? 0) + 1;
  }
  return counts as Record<AttackCategory, number>;
}

/**
 * Get all unique tags across all seeds.
 */
export function getAllTags(): string[] {
  const tags = new Set<string>();
  for (const seed of ALL_SEEDS) {
    for (const tag of seed.tags) {
      tags.add(tag);
    }
  }
  return [...tags].sort();
}

/**
 * Get all unique MITRE technique references across all seeds.
 */
export function getAllMitreReferences(): Array<{ id: string; name: string; seedCount: number }> {
  const map = new Map<string, { name: string; count: number }>();
  for (const seed of ALL_SEEDS) {
    for (const m of seed.mitre) {
      const existing = map.get(m.id);
      if (existing) {
        existing.count++;
      } else {
        map.set(m.id, { name: m.name, count: 1 });
      }
    }
  }
  return [...map.entries()]
    .map(([id, { name, count }]) => ({ id, name, seedCount: count }))
    .sort((a, b) => b.seedCount - a.seedCount);
}

/**
 * Generate a summary report from seed results.
 */
export function generateReport(agentId: string, results: SeedResult[]): RedTeamReport {
  const passCount = results.filter(r => !r.boundaryCrossed).length;

  // Per-category pass rates
  const categoryResults: Record<string, { pass: number; total: number }> = {};
  for (const result of results) {
    const seed = getSeedById(result.seedId);
    if (!seed) continue;
    const cat = seed.category;
    if (!categoryResults[cat]) categoryResults[cat] = { pass: 0, total: 0 };
    categoryResults[cat].total++;
    if (!result.boundaryCrossed) categoryResults[cat].pass++;
  }
  const categoryPassRates: Record<string, number> = {};
  for (const [cat, { pass, total }] of Object.entries(categoryResults)) {
    categoryPassRates[cat] = total > 0 ? pass / total : 0;
  }

  // Per-dimension averages
  const dimTotals: Record<string, { sum: number; count: number }> = {};
  for (const result of results) {
    for (const [dim, score] of Object.entries(result.dimensionScores)) {
      if (!dimTotals[dim]) dimTotals[dim] = { sum: 0, count: 0 };
      dimTotals[dim].sum += score;
      dimTotals[dim].count++;
    }
  }
  const dimensionAverages: Record<string, number> = {};
  for (const [dim, { sum, count }] of Object.entries(dimTotals)) {
    dimensionAverages[dim] = count > 0 ? sum / count : 0;
  }

  return {
    agentId,
    results,
    passRate: results.length > 0 ? passCount / results.length : 0,
    categoryPassRates: categoryPassRates as Record<AttackCategory, number>,
    dimensionAverages,
    generatedAt: Date.now(),
  };
}
