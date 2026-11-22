import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Plugin } from 'vite';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { generatePaperDigest } from '../shared/digestCore.ts';
import type { Language, TaskHistoryItem, Template } from '../types.ts';

export const SYSTEM_TEMPLATES = [
  'general_article',
  'standard',
  'brief',
  'methods',
  'review',
  'aivc_paper',
  'scp_paper',
];

const MAX_HISTORY_ITEMS = 20;
const MAX_JSON_BYTES = 5 * 1024 * 1024; // 5 MB for templates / history
const MAX_DIGEST_BYTES = 80 * 1024 * 1024; // 80 MB for base64 PDF upload

let proxyInitialized = false;

function ensureProxyConfigured(env: Record<string, string>) {
  if (proxyInitialized) return;
  const proxyUrl =
    env.HTTPS_PROXY ||
    env.HTTP_PROXY ||
    env.https_proxy ||
    env.http_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy;

  if (proxyUrl) {
    try {
      setGlobalDispatcher(new ProxyAgent(proxyUrl));
      console.log(`[ScholarDigest] Server proxy configured: ${proxyUrl}`);
    } catch (e) {
      console.warn('[ScholarDigest] Failed to configure server proxy:', e);
    }
  }
  proxyInitialized = true;
}

function sanitizeTemplateId(raw: string): string {
  return raw
    .replace(/[^a-z0-9_\- ]/gi, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function formatTemplateName(id: string): string {
  return id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function resolveSafeTemplatePath(templatesDir: string, safeId: string): string | null {
  if (!safeId || safeId.includes('..') || safeId.includes('/') || safeId.includes('\\')) {
    return null;
  }
  const resolvedDir = path.resolve(templatesDir);
  const target = path.resolve(resolvedDir, `${safeId}.md`);
  if (!target.startsWith(resolvedDir + path.sep)) {
    return null;
  }
  return target;
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = statusCode;
  res.end(JSON.stringify(data));
}

function readJsonBody<T = Record<string, unknown>>(req: IncomingMessage, maxBytes: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let aborted = false;

    req.on('data', (chunk: Buffer | string) => {
      if (aborted) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > maxBytes) {
        aborted = true;
        reject(Object.assign(new Error('Request payload too large.'), { statusCode: 413 }));
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => {
      if (aborted) return;
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(JSON.parse(raw) as T);
      } catch {
        reject(Object.assign(new Error('Invalid JSON payload.'), { statusCode: 400 }));
      }
    });

    req.on('error', (err) => {
      if (!aborted) reject(err);
    });
  });
}

function readHistoryFile(historyFile: string): TaskHistoryItem[] {
  if (!fs.existsSync(historyFile)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function scholarDigestApiPlugin(rootDir: string, env: Record<string, string>): Plugin {
  const templatesDir = path.join(rootDir, 'templates');
  const tempDir = path.join(rootDir, 'temp');
  const historyFile = path.join(tempDir, 'history.json');

  return {
    name: 'scholardigest-local-api',
    configureServer(server) {
      ensureProxyConfigured(env);

      // POST /api/digest — Server-side Gemini analysis (keeps API key out of browser bundle)
      server.middlewares.use('/api/digest', async (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }

        try {
          const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
          if (!apiKey) {
            sendJson(res, 500, {
              error: 'GEMINI_API_KEY is not configured. Please set it in .env.local and restart the server.',
            });
            return;
          }

          const body = await readJsonBody<{
            filename?: string;
            mimeType?: string;
            dataBase64?: string;
            template?: string;
            language?: Language;
            model?: string;
          }>(req, MAX_DIGEST_BYTES);

          if (!body.dataBase64 || !body.template) {
            sendJson(res, 400, { error: 'Missing file data or template content.' });
            return;
          }

          const fileBuffer = Buffer.from(body.dataBase64, 'base64');
          if (fileBuffer.length === 0) {
            sendJson(res, 400, { error: 'Uploaded file is empty.' });
            return;
          }

          const language: Language = body.language === 'cn' ? 'cn' : 'en';
          const result = await generatePaperDigest({
            apiKey,
            fileBuffer,
            mimeType: body.mimeType || 'application/pdf',
            filename: body.filename,
            template: body.template,
            language,
            model: body.model,
            onStatus: (msg) => console.log(`[ScholarDigest] ${msg}`),
          });

          sendJson(res, 200, result);
        } catch (err: unknown) {
          const status = (err as { statusCode?: number })?.statusCode || 500;
          const message = err instanceof Error ? err.message : 'Failed to analyze paper.';
          console.error('[ScholarDigest] Digest API error:', err);
          sendJson(res, status, { error: message });
        }
      });

      // POST /api/save-template — Save or update custom template
      server.middlewares.use('/api/save-template', async (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }

        try {
          const body = await readJsonBody<{ id?: string; name?: string; content?: string }>(req, MAX_JSON_BYTES);
          const { id, name, content } = body;

          if ((!id && !name) || typeof content !== 'string' || !content.trim()) {
            sendJson(res, 400, { error: 'Missing template name or content.' });
            return;
          }

          const safeId = id ? sanitizeTemplateId(id) : sanitizeTemplateId(name || '');
          if (!safeId) {
            sendJson(res, 400, {
              error: 'Invalid template name. Please use alphanumeric characters, spaces, dashes, or underscores.',
            });
            return;
          }

          if (SYSTEM_TEMPLATES.includes(safeId)) {
            sendJson(res, 403, { error: `Cannot modify built-in system template "${safeId}".` });
            return;
          }

          if (!fs.existsSync(templatesDir)) {
            fs.mkdirSync(templatesDir, { recursive: true });
          }

          const filePath = resolveSafeTemplatePath(templatesDir, safeId);
          if (!filePath) {
            sendJson(res, 400, { error: 'Invalid template path.' });
            return;
          }

          fs.writeFileSync(filePath, content, 'utf-8');
          console.log(`[ScholarDigest] Saved template to ${filePath}`);

          const template: Template = {
            id: safeId,
            name: formatTemplateName(safeId),
            content,
            isDefault: false,
          };

          sendJson(res, 200, {
            success: true,
            id: safeId,
            filename: `${safeId}.md`,
            template,
          });
        } catch (err: unknown) {
          const status = (err as { statusCode?: number })?.statusCode || 500;
          const message = err instanceof Error ? err.message : 'Error saving template.';
          console.error('[ScholarDigest] Error saving template:', err);
          sendJson(res, status, { error: message });
        }
      });

      // GET /api/templates & DELETE /api/templates/:id
      server.middlewares.use('/api/templates', (req, res, next) => {
        const cleanUrl = (req.url || '/').split('?')[0];

        if (req.method === 'GET' && (cleanUrl === '/' || cleanUrl === '')) {
          try {
            if (!fs.existsSync(templatesDir)) {
              fs.mkdirSync(templatesDir, { recursive: true });
            }

            const files = fs.readdirSync(templatesDir).filter((file) => file.endsWith('.md'));
            const templates: Template[] = files.map((file) => {
              const id = file.replace(/\.md$/, '');
              const content = fs.readFileSync(path.join(templatesDir, file), 'utf-8');
              return {
                id,
                name: formatTemplateName(id),
                content,
                isDefault: SYSTEM_TEMPLATES.includes(id),
              };
            });

            // Keep general_article first, then defaults, then custom templates alphabetically
            templates.sort((a, b) => {
              if (a.id === 'general_article') return -1;
              if (b.id === 'general_article') return 1;
              if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
              return a.name.localeCompare(b.name);
            });

            sendJson(res, 200, templates);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Error listing templates.';
            console.error('[ScholarDigest] Error listing templates:', err);
            sendJson(res, 500, { error: message });
          }
          return;
        }

        if (req.method === 'DELETE' && cleanUrl.length > 1) {
          try {
            const rawId = decodeURIComponent(cleanUrl.slice(1));
            const safeId = sanitizeTemplateId(rawId);

            if (!safeId || safeId !== rawId.toLowerCase()) {
              sendJson(res, 400, { error: 'Invalid template id.' });
              return;
            }

            if (SYSTEM_TEMPLATES.includes(safeId)) {
              sendJson(res, 403, { error: `Built-in system template "${safeId}" cannot be deleted.` });
              return;
            }

            const filePath = resolveSafeTemplatePath(templatesDir, safeId);
            if (!filePath || !fs.existsSync(filePath)) {
              sendJson(res, 404, { error: 'Template not found.' });
              return;
            }

            fs.unlinkSync(filePath);
            console.log(`[ScholarDigest] Deleted template ${filePath}`);
            sendJson(res, 200, { success: true, id: safeId });
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Error deleting template.';
            console.error('[ScholarDigest] Error deleting template:', err);
            sendJson(res, 500, { error: message });
          }
          return;
        }

        next();
      });

      // GET/POST /api/history & DELETE /api/history/:id
      server.middlewares.use('/api/history', async (req, res, next) => {
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        const cleanUrl = (req.url || '/').split('?')[0];

        if (req.method === 'GET' && (cleanUrl === '/' || cleanUrl === '')) {
          try {
            const history = readHistoryFile(historyFile);
            sendJson(res, 200, history);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Error reading history.';
            console.error('[ScholarDigest] Error reading history:', err);
            sendJson(res, 500, { error: message });
          }
          return;
        }

        if (req.method === 'POST' && (cleanUrl === '/' || cleanUrl === '')) {
          try {
            const newHistoryItem = await readJsonBody<TaskHistoryItem>(req, MAX_JSON_BYTES);
            const history = readHistoryFile(historyFile).filter((item) => item.id !== newHistoryItem.id);
            const updatedHistory = [newHistoryItem, ...history].slice(0, MAX_HISTORY_ITEMS);
            fs.writeFileSync(historyFile, JSON.stringify(updatedHistory, null, 2), 'utf-8');
            sendJson(res, 200, updatedHistory);
          } catch (err: unknown) {
            const status = (err as { statusCode?: number })?.statusCode || 500;
            const message = err instanceof Error ? err.message : 'Error saving history.';
            console.error('[ScholarDigest] Error saving history:', err);
            sendJson(res, status, { error: message });
          }
          return;
        }

        if (req.method === 'DELETE' && cleanUrl.length > 1) {
          try {
            const idToDelete = decodeURIComponent(cleanUrl.slice(1));
            const history = readHistoryFile(historyFile);
            const updatedHistory = history.filter((item) => item.id !== idToDelete);
            fs.writeFileSync(historyFile, JSON.stringify(updatedHistory, null, 2), 'utf-8');
            sendJson(res, 200, updatedHistory);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Error deleting history item.';
            console.error('[ScholarDigest] Error deleting history item:', err);
            sendJson(res, 500, { error: message });
          }
          return;
        }

        next();
      });
    },
  };
}
