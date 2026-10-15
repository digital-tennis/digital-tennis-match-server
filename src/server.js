import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { MAX_BYTES, ProtocolError, parseEnvelope } from './protocol.js';
import { RoomManager } from './rooms.js';

export async function startServer({ host = '127.0.0.1', port = 8080, heartbeatMs = 15000, sweepMs = 1000 } = {}) {
  const clients = new Map();
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/health') { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ status: 'ok', rooms: rooms.rooms.size, connections: clients.size, relayedMessages: rooms.relayCount }));
  });
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_BYTES, perMessageDeflate: false });
  const send = (client, message) => {
    if (client.readyState !== WebSocket.OPEN) return;
    if (client.bufferedAmount > 256 * 1024) { client.close(1013, 'Slow client'); return; }
    client.send(JSON.stringify(message));
  };
  const rooms = new RoomManager({ send });
  wss.on('connection', client => {
    clients.set(client, { tokens: 120, at: Date.now(), lastSeen: Date.now(), roomRequests: [] });
    client.on('message', (data, binary) => {
      const state = clients.get(client); if (!state) return;
      let requestId = null;
      try {
        const now = Date.now(); state.tokens = Math.min(120, state.tokens + (now - state.at) * .06); state.at = now;
        if (state.tokens < 1) throw new ProtocolError('RATE_LIMITED'); state.tokens--;
        const message = parseEnvelope(data, binary); requestId = message.requestId; state.lastSeen = now;
        if (['room.create', 'room.join'].includes(message.type)) {
          state.roomRequests = state.roomRequests.filter(at => now - at < 30000);
          if (state.roomRequests.length >= 5) throw new ProtocolError('RATE_LIMITED'); state.roomRequests.push(now);
        }
        rooms.handle(client, message.type, message.payload, requestId);
      } catch (error) {
        if (!(error instanceof ProtocolError)) console.error('Unexpected request failure:', error.name);
        send(client, { v: 1, type: 'error', requestId, payload: { code: error instanceof ProtocolError ? error.code : 'INTERNAL_ERROR', message: error instanceof ProtocolError ? error.message : 'Request failed' } });
      }
    });
    client.on('close', () => { clients.delete(client); rooms.disconnect(client); });
    client.on('error', () => {});
  });
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [client, state] of clients) if (now - state.lastSeen >= heartbeatMs) { rooms.disconnect(client); client.terminate(); }
    rooms.sweep();
  }, sweepMs); timer.unref();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return {
    server, rooms, url: `ws://${host}:${server.address().port}/ws`,
    async stop() {
      clearInterval(timer); for (const client of clients.keys()) client.terminate();
      await new Promise(resolve => wss.close(resolve)); await new Promise(resolve => server.close(resolve));
    }
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8080), host = process.env.HOST ?? '127.0.0.1';
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
  const app = await startServer({ host, port });
  console.log(`Digital Tennis listening on ${app.url}`);
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { await app.stop(); process.exit(0); });
}
