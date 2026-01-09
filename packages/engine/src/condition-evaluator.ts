/**
 * Condition Evaluator
 *
 * Evaluates policy conditions against action envelopes.
 * Supports nested AND/OR/NOT logic and various comparison operators.
 */

import type { ActionEnvelope, PolicyRule } from './types.js';

type PolicyCondition = NonNullable<PolicyRule['condition']>;

/**
 * Evaluate a condition against an envelope
 */
export function evaluateCondition(
  condition: PolicyRule['condition'],
  envelope: ActionEnvelope
): boolean {
  if (!condition) {
    return true;
  }
  // Handle logical operators
  if (condition.all) {
    return condition.all.every((c) => evaluateCondition(c, envelope));
  }

  if (condition.any) {
    return condition.any.some((c) => evaluateCondition(c, envelope));
  }

  if (condition.not) {
    return !evaluateCondition(condition.not, envelope);
  }

  // Handle field comparison
  const field = condition.field as string | undefined;
  const operator = condition.operator as PolicyCondition['operator'];
  const value = condition.value;

  if (field && operator) {
    const fieldValue = getFieldValue(envelope as unknown as Record<string, unknown>, field);
    return evaluateOperator(operator, fieldValue, value);
  }

  // Empty condition matches everything
  return true;
}

/**
 * Get a nested field value using dot notation
 */
function getFieldValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Evaluate a comparison operator
 */
function evaluateOperator(
  operator: PolicyCondition['operator'],
  fieldValue: unknown,
  conditionValue: unknown
): boolean {
  switch (operator) {
    case 'eq':
      return fieldValue === conditionValue;

    case 'neq':
      return fieldValue !== conditionValue;

    case 'gt':
      return typeof fieldValue === 'number' &&
        typeof conditionValue === 'number' &&
        fieldValue > conditionValue;

    case 'gte':
      return typeof fieldValue === 'number' &&
        typeof conditionValue === 'number' &&
        fieldValue >= conditionValue;

    case 'lt':
      return typeof fieldValue === 'number' &&
        typeof conditionValue === 'number' &&
        fieldValue < conditionValue;

    case 'lte':
      return typeof fieldValue === 'number' &&
        typeof conditionValue === 'number' &&
        fieldValue <= conditionValue;

    case 'in':
      return Array.isArray(conditionValue) && conditionValue.includes(fieldValue);

    case 'notIn':
      return Array.isArray(conditionValue) && !conditionValue.includes(fieldValue);

    case 'contains':
      return typeof fieldValue === 'string' &&
        typeof conditionValue === 'string' &&
        fieldValue.includes(conditionValue);

    case 'startsWith':
      return typeof fieldValue === 'string' &&
        typeof conditionValue === 'string' &&
        fieldValue.startsWith(conditionValue);

    case 'endsWith':
      return typeof fieldValue === 'string' &&
        typeof conditionValue === 'string' &&
        fieldValue.endsWith(conditionValue);

    case 'matches':
      if (typeof fieldValue !== 'string' || typeof conditionValue !== 'string') {
        return false;
      }
      try {
        const regex = new RegExp(conditionValue);
        return regex.test(fieldValue);
      } catch {
        return false;
      }

    case 'exists':
      return conditionValue
        ? fieldValue !== undefined && fieldValue !== null
        : fieldValue === undefined || fieldValue === null;

    default:
      return false;
  }
}
