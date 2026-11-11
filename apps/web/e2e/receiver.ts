import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export type Received = { headers: Record<string, string>; body: string };

/** A webhook receiver on 127.0.0.1 that answers each request with the next status (the last one repeats). */
export async function startReceiver(statuses: number[] = [200]) {
  const received: Received[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ headers: req.headers as Record<string, string>, body });
      res.writeHead(statuses[Math.min(received.length, statuses.length) - 1]).end('ok');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`,
    received,
    close: () => new Promise<void>((r) => (server.closeAllConnections(), server.close(() => r()))),
  };
}
