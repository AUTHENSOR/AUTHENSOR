/**
 * Aegis Service — Control plane integration for content scanning.
 *
 * Wraps @authensor/aegis scanner and persists scan results to DB.
 * Runs inline during /evaluate if AUTHENSOR_AEGIS_ENABLED=true.
 */

import { db } from '../db.js';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

// Lazy-load scanner to keep startup fast when aegis isn't used
let _scanner: any = null;

async function getScanner() {
  if (_scanner) return _scanner;
  try {
    const aegis = await import('@authensor/aegis');
    _scanner = new aegis.AegisScanner();
    return _scanner;
  } catch {
    console.warn('[aegis] @authensor/aegis not available — content scanning disabled');
    return null;
  }
}

export function isAegisEnabled(): boolean {
  return process.env.AUTHENSOR_AEGIS_ENABLED === 'true';
}

export interface AegisScanInput {
  content: string;
  receiptId?: string;
  mode?: 'block' | 'redact' | 'warn';
  detectors?: string[];
}

export interface AegisScanOutput {
  id: string;
  safe: boolean;
  threatLevel: string;
  detections: any[];
  redacted?: string;
  scanTimeMs: number;
  scanTarget?: 'input' | 'output';
  toolName?: string;
  outputRulesChecked?: number;
  outputDetectionsFound?: number;
}

/**
 * Scan content for threats. Persists result to DB if receiptId provided.
 */
export async function scanContent(input: AegisScanInput): Promise<AegisScanOutput | null> {
  const scanner = await getScanner();
  if (!scanner) return null;

  const result = scanner.scan(input.content, {
    mode: input.mode ?? 'block',
    detectors: input.detectors,
  });

  const id = randomUUID();
  const contentHash = createHash('sha256').update(input.content).digest('hex').slice(0, 16);

  // Persist to DB
  try {
    await db.query(
      `INSERT INTO aegis_scans (id, receipt_id, content_hash, safe, threat_level, detections, detector_stats, scan_time_ms, mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        input.receiptId ?? null,
        contentHash,
        result.safe,
        result.threatLevel,
        JSON.stringify(result.detections),
        JSON.stringify(result.detectorStats),
        result.scanTimeMs,
        input.mode ?? 'block',
      ]
    );
  } catch (err) {
    console.error('[aegis] Failed to persist scan result:', (err as Error).message);
  }

  return {
    id,
    safe: result.safe,
    threatLevel: result.threatLevel,
    detections: result.detections,
    redacted: result.redacted,
    scanTimeMs: result.scanTimeMs,
  };
}

/**
 * Scan an action envelope's content for threats.
 * Extracts scannable text from action parameters and resource.
 */
export async function scanEnvelope(
  envelope: any,
  receiptId: string
): Promise<AegisScanOutput | null> {
  if (!isAegisEnabled()) return null;

  // Build scannable content from envelope fields
  const parts: string[] = [];
  if (envelope.action?.resource) parts.push(envelope.action.resource);
  if (envelope.action?.parameters) {
    parts.push(JSON.stringify(envelope.action.parameters));
  }
  if (envelope.context?.metadata) {
    parts.push(JSON.stringify(envelope.context.metadata));
  }

  const content = parts.join('\n');
  if (!content.trim()) return null;

  const mode = (process.env.AUTHENSOR_AEGIS_MODE as 'block' | 'redact' | 'warn') ?? 'warn';
  return scanContent({ content, receiptId, mode });
}

/**
 * Scan tool result/output for threats (OWASP ASI01 — indirect prompt injection).
 *
 * When an agent executes a tool and receives results, those results may contain
 * indirect prompt injection payloads. This function scans tool output using
 * output-specific rules plus standard detectors.
 *
 * @param receiptId The receipt ID this result belongs to
 * @param result The tool execution result object
 * @param toolName Optional name of the tool that produced the result
 */
export async function scanToolResult(
  receiptId: string,
  result: unknown,
  toolName?: string
): Promise<AegisScanOutput | null> {
  if (!isAegisEnabled()) return null;

  // Serialize the result to scannable text
  const content = typeof result === 'string' ? result : JSON.stringify(result);
  if (!content || !content.trim()) return null;

  const scanner = await getScanner();
  if (!scanner) return null;

  const mode = (process.env.AUTHENSOR_AEGIS_MODE as 'block' | 'redact' | 'warn') ?? 'warn';

  const scanResult = scanner.scanOutput(content, {
    mode,
    toolName,
    includeStandardDetectors: true,
  });

  const id = randomUUID();
  const contentHash = createHash('sha256').update(content).digest('hex').slice(0, 16);

  // Persist to DB with scan_target = 'output'
  try {
    await db.query(
      `INSERT INTO aegis_scans (id, receipt_id, content_hash, safe, threat_level, detections, detector_stats, scan_time_ms, mode, scan_target, tool_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        receiptId,
        contentHash,
        scanResult.safe,
        scanResult.threatLevel,
        JSON.stringify(scanResult.detections),
        JSON.stringify(scanResult.detectorStats),
        scanResult.scanTimeMs,
        mode,
        'output',
        toolName ?? null,
      ]
    );
  } catch (err) {
    console.error('[aegis] Failed to persist output scan result:', (err as Error).message);
  }

  return {
    id,
    safe: scanResult.safe,
    threatLevel: scanResult.threatLevel,
    detections: scanResult.detections,
    redacted: scanResult.redacted,
    scanTimeMs: scanResult.scanTimeMs,
    scanTarget: 'output',
    toolName: scanResult.toolName,
    outputRulesChecked: scanResult.outputRulesChecked,
    outputDetectionsFound: scanResult.outputDetectionsFound,
  };
}

/**
 * Get scan results for a receipt.
 */
export async function getScansForReceipt(receiptId: string) {
  const { rows } = await db.query(
    `SELECT id, receipt_id, safe, threat_level, detections, detector_stats, scan_time_ms, mode, scan_target, tool_name, created_at
     FROM aegis_scans WHERE receipt_id = $1 ORDER BY created_at DESC`,
    [receiptId]
  );
  return rows.map((r: any) => ({
    id: r.id,
    receiptId: r.receipt_id,
    safe: r.safe,
    threatLevel: r.threat_level,
    detections: r.detections,
    detectorStats: r.detector_stats,
    scanTimeMs: r.scan_time_ms,
    mode: r.mode,
    scanTarget: r.scan_target ?? 'input',
    toolName: r.tool_name,
    createdAt: r.created_at,
  }));
}

/**
 * Get recent scans with optional filters.
 */
export async function getRecentScans(options?: {
  limit?: number;
  threatLevel?: string;
  safe?: boolean;
}) {
  const limit = options?.limit ?? 50;
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (options?.threatLevel) {
    conditions.push(`threat_level = $${paramIdx++}`);
    params.push(options.threatLevel);
  }
  if (options?.safe !== undefined) {
    conditions.push(`safe = $${paramIdx++}`);
    params.push(options.safe);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const { rows } = await db.query(
    `SELECT id, receipt_id, safe, threat_level, detections, scan_time_ms, mode, created_at
     FROM aegis_scans ${where} ORDER BY created_at DESC LIMIT $${paramIdx}`,
    params
  );

  return rows.map((r: any) => ({
    id: r.id,
    receiptId: r.receipt_id,
    safe: r.safe,
    threatLevel: r.threat_level,
    detections: r.detections,
    scanTimeMs: r.scan_time_ms,
    mode: r.mode,
    createdAt: r.created_at,
  }));
}

/**
 * Get Aegis statistics summary.
 */
export async function getAegisStats() {
  try {
    const { rows } = await db.query(`
      SELECT
        COUNT(*) as total_scans,
        COUNT(*) FILTER (WHERE NOT safe) as threats_found,
        AVG(scan_time_ms) as avg_scan_time,
        COUNT(DISTINCT receipt_id) as receipts_scanned
      FROM aegis_scans
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);
    const row = rows[0] || {};
    return {
      totalScans: parseInt(row.total_scans || '0'),
      threatsFound: parseInt(row.threats_found || '0'),
      avgScanTimeMs: parseFloat(row.avg_scan_time || '0'),
      receiptsScanned: parseInt(row.receipts_scanned || '0'),
      threatRate:
        parseInt(row.total_scans || '0') > 0
          ? parseInt(row.threats_found || '0') / parseInt(row.total_scans || '0')
          : 0,
    };
  } catch {
    return { totalScans: 0, threatsFound: 0, avgScanTimeMs: 0, receiptsScanned: 0, threatRate: 0 };
  }
}
