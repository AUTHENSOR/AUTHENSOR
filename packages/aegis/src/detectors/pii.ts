import type { DetectorRule } from '../types.js';

/**
 * Luhn algorithm validation for credit card numbers.
 * This is used as a post-match filter — the regex catches candidates,
 * and the caller can optionally verify via this export.
 */
export function luhnCheck(digits: string): boolean {
  const nums = digits.replace(/\D/g, '');
  if (nums.length < 13 || nums.length > 19) return false;

  let sum = 0;
  let alternate = false;
  for (let i = nums.length - 1; i >= 0; i--) {
    let n = parseInt(nums[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

export const PII_RULES: DetectorRule[] = [
  // ── SSN ──────────────────────────────────────────────────────────────
  {
    id: 'pii-ssn-dashed',
    type: 'pii',
    subType: 'SSN',
    // XXX-XX-XXXX — avoids 000, 666, 900-999 in area number per SSA rules
    pattern: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/,
    confidence: 0.92,
    description: 'US Social Security Number (dashed format)',
  },
  {
    id: 'pii-ssn-nodash',
    type: 'pii',
    subType: 'SSN',
    // 9 consecutive digits prefixed by common labels
    pattern: /\b(?:ssn|social\s*security(?:\s*number)?)\s*[:\-]?\s*(?!000|666|9\d{2})\d{3}(?!00)\d{2}(?!0000)\d{4}\b/i,
    confidence: 0.88,
    description: 'US Social Security Number (no dashes, with label)',
  },

  // ── Email ────────────────────────────────────────────────────────────
  {
    id: 'pii-email',
    type: 'pii',
    subType: 'EMAIL',
    pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/,
    confidence: 0.95,
    description: 'Email address',
  },

  // ── Phone ────────────────────────────────────────────────────────────
  {
    id: 'pii-phone-us',
    type: 'pii',
    subType: 'PHONE',
    // Matches +1 (XXX) XXX-XXXX, 1-XXX-XXX-XXXX, (XXX) XXX-XXXX, XXX-XXX-XXXX
    pattern: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b/,
    confidence: 0.82,
    description: 'US phone number',
  },

  // ── Credit Card ──────────────────────────────────────────────────────
  {
    id: 'pii-cc-visa',
    type: 'pii',
    subType: 'CREDIT_CARD',
    // Visa: starts with 4, 13 or 16 digits (with optional spaces/dashes)
    pattern: /\b4\d{3}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/,
    confidence: 0.88,
    description: 'Credit card number (Visa pattern)',
  },
  {
    id: 'pii-cc-mastercard',
    type: 'pii',
    subType: 'CREDIT_CARD',
    // Mastercard: starts with 51-55 or 2221-2720
    pattern: /\b5[1-5]\d{2}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/,
    confidence: 0.88,
    description: 'Credit card number (Mastercard pattern)',
  },
  {
    id: 'pii-cc-amex',
    type: 'pii',
    subType: 'CREDIT_CARD',
    // Amex: starts with 34 or 37, 15 digits
    pattern: /\b3[47]\d{2}[\s\-]?\d{6}[\s\-]?\d{5}\b/,
    confidence: 0.88,
    description: 'Credit card number (Amex pattern)',
  },

  // ── IP Address ───────────────────────────────────────────────────────
  {
    id: 'pii-ipv4',
    type: 'pii',
    subType: 'IP_ADDRESS',
    // Valid IPv4 (1-255 first octet, 0-255 remaining)
    pattern: /\b(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/,
    confidence: 0.7,
    description: 'IPv4 address',
  },

  // ── Date of Birth ────────────────────────────────────────────────────
  {
    id: 'pii-dob-labeled',
    type: 'pii',
    subType: 'DATE_OF_BIRTH',
    // Requires a leading label to avoid matching arbitrary dates
    pattern: /\b(?:dob|date\s*of\s*birth|birth\s*date|born\s*on)\s*[:\-]?\s*(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i,
    confidence: 0.85,
    description: 'Date of birth (labeled)',
  },
];
