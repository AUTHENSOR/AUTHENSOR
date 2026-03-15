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

  // ── Phone — US ───────────────────────────────────────────────────────
  {
    id: 'pii-phone-us',
    type: 'pii',
    subType: 'PHONE',
    // Matches +1 (XXX) XXX-XXXX, 1-XXX-XXX-XXXX, (XXX) XXX-XXXX, XXX-XXX-XXXX
    pattern: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b/,
    confidence: 0.82,
    description: 'US phone number',
  },

  // ── Phone — International ─────────────────────────────────────────────
  {
    id: 'pii-phone-uk',
    type: 'pii',
    subType: 'PHONE_INTL',
    // UK: +44 XXXX XXXXXX or +44 (0)XX XXXX XXXX
    pattern: /\+44[\s\-]?(?:\(0\))?[\s\-]?\d{2,4}[\s\-]?\d{3,4}[\s\-]?\d{3,4}\b/,
    confidence: 0.8,
    description: 'UK phone number (+44)',
  },
  {
    id: 'pii-phone-eu',
    type: 'pii',
    subType: 'PHONE_INTL',
    // Common EU country codes: +33 (FR), +49 (DE), +34 (ES), +39 (IT), +31 (NL), etc.
    // Flexible pattern: country code followed by 7–12 digits with optional separators
    pattern: /\+(?:33|49|34|39|31|32|41|43|45|46|47|48|351|353|358|370|371|372|380|385|386|420|421)[\s\-]?\d{1,4}[\s\-]?\d{2,4}[\s\-]?\d{2,6}\b/,
    confidence: 0.78,
    description: 'European phone number',
  },
  {
    id: 'pii-phone-india',
    type: 'pii',
    subType: 'PHONE_INTL',
    // India: +91 XXXXX XXXXX (10 digits after country code)
    pattern: /\+91[\s\-]?\d{5}[\s\-]?\d{5}\b/,
    confidence: 0.82,
    description: 'Indian phone number (+91)',
  },
  {
    id: 'pii-phone-australia',
    type: 'pii',
    subType: 'PHONE_INTL',
    // Australia: +61 X XXXX XXXX
    pattern: /\+61[\s\-]?\d[\s\-]?\d{4}[\s\-]?\d{4}\b/,
    confidence: 0.82,
    description: 'Australian phone number (+61)',
  },
  {
    id: 'pii-phone-japan',
    type: 'pii',
    subType: 'PHONE_INTL',
    // Japan: +81 XX XXXX XXXX
    pattern: /\+81[\s\-]?\d{1,4}[\s\-]?\d{2,4}[\s\-]?\d{4}\b/,
    confidence: 0.8,
    description: 'Japanese phone number (+81)',
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
  {
    id: 'pii-dob-natural-language',
    type: 'pii',
    subType: 'DATE_OF_BIRTH',
    // Matches both: "born on January 5, 1990" (month-first) and "born on 12th March 1985" (day-first)
    pattern: /\bborn\s+on\s+(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})\b/i,
    confidence: 0.85,
    description: 'Date of birth in natural language',
  },

  // ── UK National Insurance Number ─────────────────────────────────────
  {
    id: 'pii-uk-ni',
    type: 'pii',
    subType: 'UK_NI',
    // Format: 2 letters + 6 digits + 1 letter (A-D), e.g. AB123456C
    // First letter cannot be D, F, I, Q, U, V; second cannot be D, F, I, O, Q, U, V
    pattern: /\b[A-CEGHJ-PR-TW-Z][A-CEGHJ-PR-TW-Z]\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/i,
    confidence: 0.88,
    description: 'UK National Insurance number',
  },

  // ── Canadian SIN ──────────────────────────────────────────────────────
  {
    id: 'pii-canadian-sin',
    type: 'pii',
    subType: 'CANADIAN_SIN',
    // 9 digits, often presented as XXX-XXX-XXX
    pattern: /\b[1-9]\d{2}[\s\-]\d{3}[\s\-]\d{3}\b/,
    confidence: 0.78,
    description: 'Canadian Social Insurance Number (SIN)',
  },

  // ── German Steuer-ID ─────────────────────────────────────────────────
  {
    id: 'pii-german-steuer-id',
    type: 'pii',
    subType: 'GERMAN_TAX_ID',
    // 11-digit number, first digit 1-9, labelled by Steuer-ID/Steueridentifikationsnummer
    pattern: /\b(?:Steuer(?:identifikations)?(?:nummer)?|Steuer-?ID)\s*[:\-]?\s*\b[1-9]\d{10}\b/i,
    confidence: 0.85,
    description: 'German Steueridentifikationsnummer (Tax ID)',
  },

  // ── Indian Aadhaar ─────────────────────────────────────────────────────
  {
    id: 'pii-aadhaar',
    type: 'pii',
    subType: 'AADHAAR',
    // 12-digit number, spaces or hyphens allowed, first digit not 0 or 1
    pattern: /\b[2-9]\d{3}[\s\-]?\d{4}[\s\-]?\d{4}\b/,
    confidence: 0.72,
    description: 'Indian Aadhaar number (12-digit UID)',
  },

  // ── Medical Record Number (MRN) ───────────────────────────────────────
  {
    id: 'pii-mrn-labeled',
    type: 'pii',
    subType: 'MEDICAL_RECORD',
    // Requires MRN/Medical Record label, 6-10 digit number
    pattern: /\b(?:mrn|medical\s*record(?:\s*number)?|patient\s*(?:id|number))\s*[:\-#]?\s*\d{6,10}\b/i,
    confidence: 0.82,
    description: 'Medical Record Number (MRN)',
  },

  // ── IBAN ──────────────────────────────────────────────────────────────
  {
    id: 'pii-iban',
    type: 'pii',
    subType: 'IBAN',
    // 2-letter country code + 2 check digits + up to 30 alphanumeric
    pattern: /\b[A-Z]{2}\d{2}[\s]?(?:[A-Z0-9]{4}[\s]?){2,7}[A-Z0-9]{1,4}\b/,
    confidence: 0.85,
    description: 'International Bank Account Number (IBAN)',
  },

  // ── SWIFT / BIC ───────────────────────────────────────────────────────
  {
    id: 'pii-swift-bic',
    type: 'pii',
    subType: 'SWIFT_BIC',
    // 8 or 11 chars: 4 bank + 2 country + 2 location + optional 3 branch
    pattern: /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/,
    confidence: 0.72,
    description: 'SWIFT/BIC code',
  },

  // ── Passport numbers ──────────────────────────────────────────────────
  {
    id: 'pii-passport-us',
    type: 'pii',
    subType: 'PASSPORT',
    // US passport: 9 alphanumeric chars with label
    pattern: /\b(?:passport(?:\s*number|\s*no\.?|\s*#)?)\s*[:\-]?\s*[A-Z]\d{8}\b/i,
    confidence: 0.82,
    description: 'US passport number',
  },
  {
    id: 'pii-passport-uk',
    type: 'pii',
    subType: 'PASSPORT',
    // UK passport: 9 digits with label
    pattern: /\b(?:passport(?:\s*number|\s*no\.?|\s*#)?)\s*[:\-]?\s*\d{9}\b/i,
    confidence: 0.78,
    description: 'UK/EU numeric passport number',
  },
  {
    id: 'pii-passport-eu',
    type: 'pii',
    subType: 'PASSPORT',
    // EU passports: 2 letters + 7 digits (DE, FR style) or similar, with label
    pattern: /\b(?:passport(?:\s*number|\s*no\.?|\s*#)?)\s*[:\-]?\s*[A-Z]{1,2}\d{6,8}\b/i,
    confidence: 0.78,
    description: 'EU passport number (letter + digit format)',
  },
];
