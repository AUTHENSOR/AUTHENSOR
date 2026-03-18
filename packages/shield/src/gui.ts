/**
 * ShieldGUI -- serves the web-based dashboard on a separate port.
 *
 * Serves the static HTML file and proxies /api/* calls to the
 * main proxy server so the GUI can read status and toggle protection.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Resolve HTML path ──────────────────────────────────────────────────

function resolveHtmlPath(): string {
  // In dist/ (compiled) -- look for ../src/ui/index.html relative to package root
  const candidates = [
    path.join(__dirname, '..', 'src', 'ui', 'index.html'),
    path.join(__dirname, 'ui', 'index.html'),
    path.join(__dirname, '..', 'ui', 'index.html'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0]; // fallback -- will 404 gracefully
}

// ── Server ─────────────────────────────────────────────────────────────

let guiServer: http.Server | null = null;

export interface GuiConfig {
  guiPort: number;
  proxyPort: number;
}

export function startGui(config: GuiConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const htmlPath = resolveHtmlPath();

    guiServer = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost`);

      // Proxy /api/* to the proxy server
      if (url.pathname.startsWith('/api/')) {
        const proxyUrl = `http://127.0.0.1:${config.proxyPort}${url.pathname}`;
        const proxyReq = http.request(
          proxyUrl,
          { method: req.method, headers: { 'content-type': 'application/json' } },
          (proxyRes) => {
            const chunks: Buffer[] = [];
            proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on('end', () => {
              res.writeHead(proxyRes.statusCode ?? 502, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              });
              res.end(Buffer.concat(chunks));
            });
          },
        );
        proxyReq.on('error', () => {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Cannot reach proxy server' }));
        });

        // Forward request body
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          req.pipe(proxyReq);
        } else {
          proxyReq.end();
        }
        return;
      }

      // Serve the HTML page for everything else
      fs.readFile(htmlPath, 'utf-8', (err, html) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Failed to load dashboard HTML');
          return;
        }

        // Inject the proxy port into the HTML so it knows where to connect
        const injected = html.replace(
          '{{PROXY_PORT}}',
          String(config.proxyPort),
        ).replace(
          '{{GUI_PORT}}',
          String(config.guiPort),
        );

        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
        res.end(injected);
      });
    });

    guiServer.on('error', reject);
    guiServer.listen(config.guiPort, () => resolve());
  });
}

export function stopGui(): Promise<void> {
  return new Promise((resolve) => {
    if (guiServer) {
      guiServer.close(() => resolve());
      guiServer = null;
    } else {
      resolve();
    }
  });
}
