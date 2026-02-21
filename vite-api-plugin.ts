import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pendingRequests = new Map<string, PendingRequest>();
let requestId = 0;

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

export function viteApiPlugin(): Plugin {
  let server: ViteDevServer;

  return {
    name: 'city-api',
    configureServer(srv) {
      server = srv;

      // Listen for responses from the browser via HMR
      server.ws.on('city:response', (data: { id: string; result: any; error?: string }) => {
        const pending = pendingRequests.get(data.id);
        if (pending) {
          clearTimeout(pending.timer);
          pendingRequests.delete(data.id);
          if (data.error) {
            pending.reject(new Error(data.error));
          } else {
            pending.resolve(data.result);
          }
        }
      });

      // Middleware for /api/* routes
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url || '';

        // CORS preflight
        if (req.method === 'OPTIONS' && url.startsWith('/api/')) {
          sendJson(res, 200, {});
          return;
        }

        if (!url.startsWith('/api/')) {
          next();
          return;
        }

        try {
          const route = url.replace('/api/', '');
          let body: any = {};

          if (req.method === 'POST') {
            body = await parseBody(req);
          }

          const id = `req_${++requestId}`;
          const command = { id, route, method: req.method, body };

          // Send command to browser via HMR WebSocket
          const result = await new Promise<any>((resolve, reject) => {
            const timer = setTimeout(() => {
              pendingRequests.delete(id);
              reject(new Error('Timeout: no browser connected or browser did not respond'));
            }, 10000);

            pendingRequests.set(id, { resolve, reject, timer });
            server.ws.send('city:command', command);
          });

          sendJson(res, 200, result);
        } catch (err: any) {
          sendJson(res, err.message?.includes('Timeout') ? 504 : 500, {
            error: err.message || 'Internal server error'
          });
        }
      });
    },
  };
}
