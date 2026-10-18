import { randomInt, randomBytes, timingSafeEqual } from 'node:crypto';
import { CODE_ALPHABET, normalizeCode, requireThat, ProtocolError, validateSignal, validateTransport, validateGame } from './protocol.js';

const randomCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
const token = () => randomBytes(32).toString('base64url');
export class RoomManager {
  constructor({ now = Date.now, generateCode = randomCode, send = () => {}, waitMs = 600000, graceMs = 15000 } = {}) {
    Object.assign(this, { now, generateCode, send, waitMs, graceMs });
    this.rooms = new Map(); this.members = new Map(); this.relayCount = 0;
  }
  response(client, type, payload, requestId = null) { this.send(client, { v: 1, type, requestId, payload }); }
  broadcast(room, type, payload) { for (const member of Object.values(room.players)) if (member?.client) this.response(member.client, type, payload); }
  create(client, requestId) {
    requireThat(!this.members.has(client), 'ALREADY_IN_ROOM');
    let code;
    for (let i = 0; i < 10; i++) { const candidate = this.generateCode(); if (!this.rooms.has(candidate)) { code = candidate; break; } }
    requireThat(code, 'CODE_EXHAUSTED');
    const room = { code, createdAt: this.now(), state: 'WAITING', epoch: 0, mode: null, proposal: null, players: {} };
    this.rooms.set(code, room); this.attach(room, 'host', client);
    this.welcome(room, 'host', 'room.created', requestId);
  }
  attach(room, role, client) {
    const member = { client, token: token(), disconnectedAt: null, room, role };
    room.players[role] = member; this.members.set(client, member); return member;
  }
  welcome(room, role, type, requestId) {
    const member = room.players[role];
    this.response(member.client, type, { code: room.code, playerId: role, reconnectToken: member.token, state: room.state }, requestId);
  }
  join(client, payload, requestId) {
    requireThat(!this.members.has(client), 'ALREADY_IN_ROOM');
    const room = this.rooms.get(normalizeCode(payload.code));
    requireThat(room, 'ROOM_NOT_FOUND'); requireThat(!room.players.guest, 'ROOM_FULL');
    requireThat(room.state === 'WAITING' && room.players.host.client, 'ROOM_UNAVAILABLE');
    this.attach(room, 'guest', client); room.state = 'READY';
    this.welcome(room, 'guest', 'room.joined', requestId);
    this.broadcast(room, 'room.ready', { code: room.code, state: room.state, epoch: room.epoch });
  }
  member(client) { const member = this.members.get(client); requireThat(member, 'NOT_IN_ROOM'); return member; }
  peer(member) { return member.room.players[member.role === 'host' ? 'guest' : 'host']; }
  handle(client, type, payload, requestId) {
    this.sweep();
    if (type === 'room.create') return this.create(client, requestId);
    if (type === 'room.join') return this.join(client, payload, requestId);
    if (type === 'session.resume') return this.resume(client, payload, requestId);
    if (type === 'heartbeat') {
      requireThat(typeof payload.clientTimeMs === 'number' && Number.isFinite(payload.clientTimeMs) && payload.clientTimeMs >= 0);
      return this.response(client, 'heartbeat.ack', { clientTimeMs: payload.clientTimeMs }, requestId);
    }
    const member = this.member(client), room = member.room, peer = this.peer(member);
    if (type === 'room.leave') {
      this.response(client, 'room.left', {}, requestId); return this.dispose(room, 'peer.left');
    }
    requireThat(peer?.client && member.client === client, 'PEER_UNAVAILABLE');
    if (type === 'peer.signal') {
      validateSignal(member.role, payload);
      // Old relay-only signaling clients omit epoch. New direct transport binds
      // every SDP/ICE callback to the next negotiated epoch.
      if (payload.epoch != null) requireThat(payload.epoch === room.epoch + 1 && ['READY', 'CONNECTING'].includes(room.state), 'INVALID_EPOCH');
      this.response(peer.client, 'peer.signal', { from: member.role, kind: payload.kind, data: payload.data, epoch: payload.epoch ?? room.epoch + 1 });
    } else if (type === 'peer.ready') {
      requireThat(payload.epoch === room.epoch + 1 && ['READY', 'CONNECTING'].includes(room.state), 'INVALID_EPOCH');
      this.response(peer.client, 'peer.ready', { from: member.role, epoch: payload.epoch });
    } else if (type === 'peer.failed') {
      const candidate = room.proposal?.mode === 'p2p' && payload.epoch === room.proposal.epoch;
      requireThat(candidate || payload.epoch === room.epoch, 'INVALID_EPOCH');
      if (!candidate && (room.mode !== 'p2p' || room.state !== 'PLAYING')) return;
      room.abortedP2PEpoch = payload.epoch;
      room.state = 'READY'; room.proposal = null;
      this.broadcast(room, 'room.ready', { code: room.code, state: room.state, epoch: room.epoch, resume: true, preferRelay: true });
    } else if (type === 'transport.propose') {
      requireThat(member.role === 'host', 'NOT_HOST'); validateTransport(payload);
      requireThat(payload.epoch === room.epoch + 1, 'INVALID_EPOCH');
      room.proposal = { mode: payload.mode, epoch: payload.epoch, ack: false }; room.state = 'CONNECTING';
      this.response(peer.client, type, payload);
    } else if (type === 'transport.ack') {
      validateTransport(payload); requireThat(member.role === 'guest', 'INVALID_ROLE');
      if (payload.mode === 'p2p' && payload.epoch === room.abortedP2PEpoch && room.proposal?.mode !== 'p2p') return this.response(client, 'transport.superseded', { epoch: payload.epoch });
      requireThat(room.proposal && payload.epoch === room.proposal.epoch && payload.mode === room.proposal.mode, 'INVALID_EPOCH');
      room.proposal.ack = true; this.response(peer.client, type, payload);
    } else if (type === 'transport.commit') {
      requireThat(member.role === 'host', 'NOT_HOST'); validateTransport(payload);
      if (payload.mode === 'p2p' && payload.epoch === room.abortedP2PEpoch && room.proposal?.mode !== 'p2p') return this.response(client, 'transport.superseded', { epoch: payload.epoch });
      requireThat(room.proposal && payload.epoch === room.proposal.epoch && payload.mode === room.proposal.mode, 'INVALID_EPOCH');
      requireThat(room.proposal.ack, 'PEER_NOT_ACKED');
      room.mode = payload.mode; room.epoch = payload.epoch; room.proposal = null; room.state = 'PLAYING';
      this.broadcast(room, 'transport.committed', { mode: room.mode, epoch: room.epoch });
    } else if (type === 'game.relay') {
      requireThat(room.state === 'PLAYING' && room.mode === 'relay' && payload.epoch === room.epoch, 'INVALID_EPOCH');
      validateGame(member.role, room.epoch, payload.message);
      this.response(peer.client, 'relay.message', { from: member.role, epoch: room.epoch, message: payload.message }); this.relayCount++;
    } else throw new ProtocolError('UNKNOWN_TYPE');
  }
  disconnect(client) {
    const member = this.members.get(client); if (!member) return;
    this.members.delete(client); member.client = null; member.disconnectedAt = this.now();
    member.room.state = 'PAUSED'; member.room.proposal = null;
    this.broadcast(member.room, 'peer.disconnected', { playerId: member.role, graceMs: this.graceMs });
  }
  resume(client, payload, requestId) {
    requireThat(!this.members.has(client), 'ALREADY_IN_ROOM');
    const room = this.rooms.get(normalizeCode(payload.code)); requireThat(room, 'ROOM_NOT_FOUND');
    requireThat(typeof payload.reconnectToken === 'string' && payload.reconnectToken.length <= 128, 'INVALID_TOKEN');
    const member = Object.values(room.players).find(p => {
      const a = Buffer.from(p.token), b = Buffer.from(payload.reconnectToken);
      return a.length === b.length && timingSafeEqual(a, b);
    });
    requireThat(member, 'INVALID_TOKEN');
    requireThat(member.disconnectedAt !== null && this.now() - member.disconnectedAt < this.graceMs, 'RESUME_EXPIRED');
    member.client = client; member.disconnectedAt = null; member.token = token(); this.members.set(client, member);
    this.welcome(room, member.role, 'session.resumed', requestId);
    if (room.players.host?.client && room.players.guest?.client) {
      room.state = 'READY';
      this.broadcast(room, 'room.ready', { code: room.code, state: room.state, resume: true, epoch: room.epoch });
    }
  }
  dispose(room, reason) {
    this.broadcast(room, reason, { reason });
    for (const member of Object.values(room.players)) if (member?.client) this.members.delete(member.client);
    room.state = 'CLOSED'; this.rooms.delete(room.code);
  }
  sweep() {
    for (const room of this.rooms.values()) {
      if (Object.values(room.players).some(p => p.disconnectedAt !== null && this.now() - p.disconnectedAt >= this.graceMs)) this.dispose(room, 'room.closed');
      else if (['WAITING', 'READY', 'CONNECTING'].includes(room.state) && room.epoch === 0 && this.now() - room.createdAt >= this.waitMs) this.dispose(room, 'room.expired');
    }
  }
}
