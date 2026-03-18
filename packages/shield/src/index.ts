/**
 * @authensor/shield
 *
 * One-click AI safety proxy with web GUI.
 * Sits between your app and AI providers, scanning every request and response.
 */

// ── Proxy server ───────────────────────────────────────────────────────
export { startProxy, stopProxy, getStatus, isActive, toggleActive } from './proxy.js';
export type { ProxyConfig, ProxyStats, ActivityEntry, ShieldStatus } from './proxy.js';

// ── GUI server ─────────────────────────────────────────────────────────
export { startGui, stopGui } from './gui.js';
export type { GuiConfig } from './gui.js';

// ── Scanner ────────────────────────────────────────────────────────────
export { scanRequest, scanResponse, getScannerInfo } from './scanner.js';
export type { ScanResult, ScanFinding, ThreatLevel } from './scanner.js';
