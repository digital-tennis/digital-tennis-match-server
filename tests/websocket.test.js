import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { startServer } from '../src/server.js';
class Peer {
  constructor(url) {
    this.ws = new WebSocket(url); this.messages = []; this.waiters = []; this.seq = 0;
    this.ws.on('message', data => { this.messages.push(JSON.parse(data)); this.flush(); });
    this.ws.on('error', () => {});
  }
  async open() { await once(this.ws, 'open'); return this; }
  send(type, payload = {}) { const requestId = 't' + ++this.seq; this.ws.send(JSON.stringify({ v: 1, type, requestId, payload })); return requestId; }
  next(type, predicate = () => true) {
    return new Promise((resolve, reject) => {
      const waiter = { type, predicate, resolve, reject, timer: setTimeout(() => { this.waiters = this.waiters.filter(w => w !== waiter); reject(new Error('Timed out: ' + type)); }, 2000) };
      this.waiters.push(waiter); this.flush();
    });
  }
  flush() {
    for (const waiter of [...this.waiters]) {
      const index = this.messages.findIndex(m => m.type === waiter.type && waiter.predicate(m));
      if (index < 0) continue;
      clearTimeout(waiter.timer); this.waiters.splice(this.waiters.indexOf(waiter), 1); waiter.resolve(this.messages.splice(index, 1)[0]);
    }
  }
}
async function setup(t) {
  const app = await startServer({ port: 0 }); const peers = [];
  t.after(async () => { for (const p of peers) p.ws.terminate(); await app.stop(); });
  const add = async () => { const p = await new Peer(app.url).open(); peers.push(p); return p; };
  return { app, add, host: await add(), guest: await add() };
}
async function room(f) {
  f.host.send('room.create'); const created = await f.host.next('room.created');
  f.guest.send('room.join', { code: ' ' + created.payload.code.toLowerCase() + ' ' }); await f.guest.next('room.joined');
  await Promise.all([f.host.next('room.ready'), f.guest.next('room.ready')]); return created.payload.code;
}
async function agree(f, epoch = 1) {
  f.host.send('transport.propose', { mode: 'relay', epoch }); await f.guest.next('transport.propose');
  f.guest.send('transport.ack', { mode: 'relay', epoch }); await f.host.next('transport.ack');
  f.host.send('transport.commit', { mode: 'relay', epoch }); await Promise.all([f.host.next('transport.committed'), f.guest.next('transport.committed')]);
}
const input = () => ({ v: 1, type: 'input', epoch: 1, inputSeq: 42, playerId: 'guest', payload: { eventId: 42, kind: 'backhand', power01: .35, aimX: .1, aimZ: 0, rallyId: 1, shotId: 2 } });
const snapshot = () => ({ v: 1, type: 'snapshot', epoch: 1, tick: 120, payload: { matchId: 'match-a', ball: { pos: [0, 1, 3], vel: [0, -2, 8] }, players: [{ id: 'host', pos: [0, .85, -9] }, { id: 'guest', pos: [0, .85, 9] }], points: [2, 1], phase: 'Rally', serverId: 'host', serveSide: 'left', faultCount: 0, lastHitter: 'host', bounceCount: 1, rallyId: 4, shotId: 12, lastProcessedInputSeq: 42 } });
test('two real WebSocket clients create/join; third rejected; health has counters and no tokens', async t => {
  const f = await setup(t); const code = await room(f); const third = await f.add();
  third.send('room.join', { code }); assert.equal((await third.next('error')).payload.code, 'ROOM_FULL');
  const health = await (await fetch(f.app.url.replace('ws:', 'http:').replace('/ws', '/health'))).json();
  assert.deepEqual(health, { status: 'ok', rooms: 1, connections: 3, relayedMessages: 0 });
});
test('offer/answer/ICE route to the peer; roles and different-room impersonation rejected', async t => {
  const f = await setup(t); const code = await room(f); const outsider = await f.add();
  f.host.send('peer.signal', { kind: 'offer', data: { type: 'offer', sdp: 'v=0\r\n' } });
  assert.equal((await f.guest.next('peer.signal')).payload.from, 'host');
  f.guest.send('peer.signal', { kind: 'answer', data: { type: 'answer', sdp: 'v=0\r\n' } }); await f.host.next('peer.signal');
  f.guest.send('peer.signal', { kind: 'ice', data: { candidate: '', sdpMid: null, sdpMLineIndex: null } }); await f.host.next('peer.signal');
  f.guest.send('peer.signal', { kind: 'offer', data: { type: 'offer', sdp: 'fake' } }); assert.equal((await f.guest.next('error')).payload.code, 'INVALID_ROLE');
  outsider.send('peer.signal', { code, playerId: 'host', kind: 'offer', data: { type: 'offer', sdp: 'fake' } }); assert.equal((await outsider.next('error')).payload.code, 'NOT_IN_ROOM');
});
test('transport must be agreed; stale epochs and guest authority are rejected', async t => {
  const f = await setup(t); await room(f);
  f.guest.send('transport.propose', { mode: 'relay', epoch: 1 }); assert.equal((await f.guest.next('error')).payload.code, 'NOT_HOST');
  f.host.send('game.relay', { epoch: 1, message: snapshot() }); assert.equal((await f.host.next('error')).payload.code, 'INVALID_EPOCH');
  await agree(f);
  f.guest.send('game.relay', { epoch: 1, message: snapshot() }); assert.equal((await f.guest.next('error')).payload.code, 'INVALID_ROLE');
  f.host.send('game.relay', { epoch: 0, message: snapshot() }); assert.equal((await f.host.next('error')).payload.code, 'INVALID_EPOCH');
  f.host.send('transport.propose', { mode: 'relay', epoch: 1 }); assert.equal((await f.host.next('error')).payload.code, 'INVALID_EPOCH');
});
test('input, authoritative snapshots and result traverse the actual relay unchanged', async t => {
  const f = await setup(t); await room(f); await agree(f);
  f.guest.send('game.relay', { epoch: 1, message: input() }); assert.deepEqual((await f.host.next('relay.message')).payload.message, input());
  f.host.send('game.relay', { epoch: 1, message: snapshot() }); assert.deepEqual((await f.guest.next('relay.message')).payload.message, snapshot());
  const result = { v: 1, type: 'result', epoch: 1, payload: { matchId: 'match-a', winner: 'host' } };
  f.host.send('game.relay', { epoch: 1, message: result }); assert.deepEqual((await f.guest.next('relay.message')).payload.message, result);
  assert.equal(f.app.rooms.relayCount, 3);
});
test('malformed request does not kill connection; heartbeat echoes request ID', async t => {
  const f = await setup(t); f.host.ws.send('{'); assert.equal((await f.host.next('error')).payload.code, 'INVALID_JSON');
  const id = f.host.send('heartbeat', { clientTimeMs: 1234 }); const ack = await f.host.next('heartbeat.ack');
  assert.equal(ack.requestId, id); assert.equal(ack.payload.clientTimeMs, 1234);
});
test('explicit leave closes room; disconnected peer resumes with rotated token and new epoch', async t => {
  const f = await setup(t); await room(f); await agree(f);
  const original = f.app.rooms.rooms.values().next().value.players.guest.token;
  const code = f.app.rooms.rooms.keys().next().value;
  f.guest.ws.close(); await f.host.next('peer.disconnected');
  const resumed = await f.add(); resumed.send('session.resume', { code, reconnectToken: original });
  const welcome = await resumed.next('session.resumed'); assert.notEqual(welcome.payload.reconnectToken, original);
  await f.host.next('room.ready'); await resumed.next('room.ready');
  f.guest = resumed; await agree(f, 2);
  f.guest.send('room.leave'); await f.host.next('peer.left'); assert.equal(f.app.rooms.rooms.size, 0);
});
test('create/join rate limit prevents room spam on one socket', async t => {
  const f = await setup(t);
  for (let i = 0; i < 6; i++) f.host.send('room.join', { code: 'ABCDEF' });
  const errors = []; for (let i = 0; i < 6; i++) errors.push((await f.host.next('error')).payload.code);
  assert.equal(errors.filter(x => x === 'RATE_LIMITED').length, 1);
});
