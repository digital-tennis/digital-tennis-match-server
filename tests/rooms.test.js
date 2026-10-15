import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../src/rooms.js';
import { normalizeCode, parseEnvelope, validateGame } from '../src/protocol.js';
function fixture(options = {}) {
  let now = 0; const messages = [];
  const manager = new RoomManager({ now: () => now, send: (client, message) => messages.push({ client, ...message }), ...options });
  return { manager, messages, time: n => { now = n; } };
}
const fails = (fn, code) => assert.throws(fn, e => e.code === code);
function pair(f) {
  f.manager.create('h', 'a'); const code = f.messages.filter(m => m.type === 'room.created').at(-1).payload.code;
  f.manager.join('g', { code }, 'b'); return code;
}
test('cryptographic codes have six unambiguous characters; normalized input', () => {
  const f = fixture();
  for (let i = 0; i < 100; i++) f.manager.create('h' + i, 'r');
  assert.equal(f.manager.rooms.size, 100);
  for (const code of f.manager.rooms.keys()) assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  assert.equal(normalizeCode(' abcd23 '), 'ABCD23');
  for (const value of ['', 'ABC0IL', 'ABC1234', null]) fails(() => normalizeCode(value), 'INVALID_CODE');
});
test('collisions retry ten times then fail without overwriting a room', () => {
  let attempts = 0; const f = fixture({ generateCode: () => { attempts++; return 'ABCDEF'; } });
  f.manager.create('h', 'r'); fails(() => f.manager.create('x', 's'), 'CODE_EXHAUSTED');
  assert.equal(attempts, 11); assert.equal(f.manager.rooms.size, 1); assert.equal(f.manager.members.size, 1);
});
test('exactly two members; repeated membership and third join rejected', () => {
  const f = fixture(); const code = pair(f);
  fails(() => f.manager.join('x', { code }, 'c'), 'ROOM_FULL');
  fails(() => f.manager.create('h', 'd'), 'ALREADY_IN_ROOM');
  assert.equal(f.manager.rooms.get(code).state, 'READY');
});
test('WAITING expires after ten minutes; PLAYING is not subject to waiting TTL', () => {
  const f = fixture(); const code = pair(f);
  f.manager.handle('h', 'transport.propose', { mode: 'relay', epoch: 1 }, 'p');
  fails(() => f.manager.handle('h', 'transport.commit', { mode: 'relay', epoch: 1 }, 'p'), 'PEER_NOT_ACKED');
  f.manager.handle('g', 'transport.ack', { mode: 'relay', epoch: 1 }, 'a');
  f.manager.handle('h', 'transport.commit', { mode: 'relay', epoch: 1 }, 'c');
  f.manager.create('waiting', 'w'); f.time(600000); f.manager.sweep();
  assert.equal(f.manager.rooms.size, 1); assert.equal(f.manager.rooms.get(code).state, 'PLAYING');
});
test('disconnect pauses; resume token rotates and requires a fresh transport epoch', () => {
  const f = fixture(); pair(f); const original = f.messages.find(m => m.type === 'room.joined').payload;
  f.manager.disconnect('g'); assert.equal(f.manager.rooms.get(original.code).state, 'PAUSED');
  fails(() => f.manager.resume('evil', { code: original.code, reconnectToken: 'wrong' }, 'x'), 'INVALID_TOKEN');
  f.time(10000); f.manager.resume('g2', original, 'resume');
  const resumed = f.messages.find(m => m.type === 'session.resumed');
  assert.notEqual(resumed.payload.reconnectToken, original.reconnectToken);
  fails(() => f.manager.resume('g3', original, 'x'), 'INVALID_TOKEN');
  fails(() => f.manager.handle('g', 'room.leave', {}, 'x'), 'NOT_IN_ROOM');
  assert.equal(f.manager.rooms.get(original.code).state, 'READY');
});
test('disconnect grace and explicit leave dispose all membership', () => {
  const f = fixture(); pair(f); f.manager.disconnect('h'); f.time(15000); f.manager.sweep();
  assert.equal(f.manager.rooms.size, 0); assert.equal(f.manager.members.size, 0);
  pair(f); f.manager.handle('g', 'room.leave', {}, 'l'); assert.equal(f.manager.members.size, 0);
});
test('malformed, binary, non-finite, deeply nested and oversized requests are rejected', () => {
  const parse = s => parseEnvelope(Buffer.from(s), false);
  fails(() => parse('{'), 'INVALID_JSON');
  fails(() => parseEnvelope(Buffer.from('{}'), true), 'BINARY_NOT_SUPPORTED');
  fails(() => parse('{"v":2,"type":"heartbeat","requestId":"r","payload":{}}'), 'INVALID_ENVELOPE');
  fails(() => parse('{"v":1,"type":"heartbeat","payload":{}}'), 'INVALID_REQUEST_ID');
  fails(() => parse('{"v":1,"type":"heartbeat","requestId":"r","payload":{"x":1e999}}'), 'INVALID_PAYLOAD');
  fails(() => parse(' '.repeat(16385)), 'MESSAGE_TOO_LARGE');
  fails(() => parse(JSON.stringify({ v: 1, type: 'heartbeat', requestId: 'r', payload: { x: JSON.parse('['.repeat(21) + '0' + ']'.repeat(21)) } })), 'INVALID_PAYLOAD');
});
test('guest cannot publish score/result; bounded normalized input required', () => {
  fails(() => validateGame('guest', 1, { v: 1, type: 'result', epoch: 1, payload: { matchId: 'a', winner: 'guest' } }), 'INVALID_ROLE');
  const msg = { v: 1, type: 'input', epoch: 1, playerId: 'guest', inputSeq: 0xffffffff, payload: { eventId: 1, kind: 'forehand', power01: .35, aimX: 0, aimZ: 0, rallyId: 1, shotId: 1 } };
  validateGame('guest', 1, msg); msg.payload.power01 = 1.1;
  fails(() => validateGame('guest', 1, msg), 'INVALID_GAME_MESSAGE');
});
