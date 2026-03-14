/**
 * Budget Alert Tests
 *
 * Tests that Sentinel's alert engine fires budget utilization alerts
 * at configured thresholds (80%, 90%, 100%).
 */

import { describe, it, expect } from 'vitest';
import { AlertEngine } from '../src/alert-engine.js';

describe('Budget utilization alerts', () => {
  it('fires info alert at 80% utilization', () => {
    const engine = new AlertEngine();
    const alerts = engine.check('budget_utilization', 0.82, 'agent-1');

    const budgetAlert = alerts.find((a) => a.ruleId === 'budget-80pct');
    expect(budgetAlert).toBeDefined();
    expect(budgetAlert!.severity).toBe('info');
    expect(budgetAlert!.metric).toBe('budget_utilization');
  });

  it('fires warning alert at 90% utilization', () => {
    const engine = new AlertEngine();
    const alerts = engine.check('budget_utilization', 0.92, 'agent-1');

    // Both 80% and 90% should fire since this is the first check
    const a80 = alerts.find((a) => a.ruleId === 'budget-80pct');
    const a90 = alerts.find((a) => a.ruleId === 'budget-90pct');
    expect(a80).toBeDefined();
    expect(a90).toBeDefined();
    expect(a90!.severity).toBe('warning');
  });

  it('fires critical alert at 100% utilization', () => {
    const engine = new AlertEngine();
    const alerts = engine.check('budget_utilization', 1.0, 'agent-1');

    const exhausted = alerts.find((a) => a.ruleId === 'budget-exhausted');
    expect(exhausted).toBeDefined();
    expect(exhausted!.severity).toBe('critical');
  });

  it('does not fire budget alert below 80%', () => {
    const engine = new AlertEngine();
    const alerts = engine.check('budget_utilization', 0.5, 'agent-1');

    const budgetAlerts = alerts.filter(
      (a) => a.ruleId.startsWith('budget-')
    );
    expect(budgetAlerts.length).toBe(0);
  });

  it('does not re-fire active alerts on repeated checks', () => {
    const engine = new AlertEngine();

    // First check: fires alert
    const alerts1 = engine.check('budget_utilization', 0.85, 'agent-1');
    const budgetAlerts1 = alerts1.filter((a) => a.ruleId === 'budget-80pct');
    expect(budgetAlerts1.length).toBe(1);

    // Second check at same level: should not re-fire (alert is already active)
    const alerts2 = engine.check('budget_utilization', 0.87, 'agent-1');
    const budgetAlerts2 = alerts2.filter((a) => a.ruleId === 'budget-80pct');
    expect(budgetAlerts2.length).toBe(0);
  });

  it('auto-resolves alert when utilization drops below threshold', () => {
    const engine = new AlertEngine();

    // Trigger alert
    engine.check('budget_utilization', 0.85, 'agent-1');
    expect(engine.getActiveAlerts().length).toBeGreaterThan(0);

    // Budget resets, utilization drops
    engine.check('budget_utilization', 0.1, 'agent-1');

    // Alert should be resolved
    const active = engine.getActiveAlerts().filter(
      (a) => a.ruleId === 'budget-80pct' && a.agentId === 'agent-1'
    );
    expect(active.length).toBe(0);
  });

  it('fires alerts for different agents independently', () => {
    const engine = new AlertEngine();

    const alerts1 = engine.check('budget_utilization', 0.85, 'agent-1');
    const alerts2 = engine.check('budget_utilization', 0.85, 'agent-2');

    expect(alerts1.filter((a) => a.ruleId === 'budget-80pct').length).toBe(1);
    expect(alerts2.filter((a) => a.ruleId === 'budget-80pct').length).toBe(1);
  });
});
