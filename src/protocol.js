export const MAX_BYTES = 16 * 1024;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export class ProtocolError extends Error {
  constructor(code, message = code) { super(message); this.code = code; }
}
export function requireThat(ok, code = 'INVALID_PAYLOAD') {
  if (!ok) throw new ProtocolError(code);
}
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const uint = x => Number.isInteger(x) && x >= 0 && x <= 0xffffffff;
const text = (x, max) => typeof x === 'string' && x.length > 0 && x.length <= max;
const role = x => x === 'host' || x === 'guest';
const bounded = (x, lo, hi) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
const vector = x => Array.isArray(x) && x.length === 3 && x.every(n => bounded(n, -1000, 1000));
function finiteTree(value, depth = 0) {
  requireThat(depth < 20);
  if (typeof value === 'number') requireThat(Number.isFinite(value));
  else if (value && typeof value === 'object') for (const child of Object.values(value)) finiteTree(child, depth + 1);
}
export function parseEnvelope(data, binary) {
  requireThat(!binary, 'BINARY_NOT_SUPPORTED');
  requireThat(data.length <= MAX_BYTES, 'MESSAGE_TOO_LARGE');
  let msg;
  try { msg = JSON.parse(data.toString('utf8')); } catch { throw new ProtocolError('INVALID_JSON'); }
  requireThat(object(msg) && msg.v === 1 && text(msg.type, 64), 'INVALID_ENVELOPE');
  requireThat(text(msg.requestId, 64), 'INVALID_REQUEST_ID');
  requireThat(object(msg.payload)); finiteTree(msg);
  return msg;
}
export function normalizeCode(code) {
  requireThat(typeof code === 'string', 'INVALID_CODE');
  const normalized = code.trim().toUpperCase();
  requireThat(normalized.length === 6 && [...normalized].every(c => CODE_ALPHABET.includes(c)), 'INVALID_CODE');
  return normalized;
}
export function validateSignal(sender, payload) {
  const { kind, data } = payload;
  requireThat(['offer', 'answer', 'ice'].includes(kind), 'INVALID_SIGNAL');
  requireThat(kind !== 'offer' || sender === 'host', 'INVALID_ROLE');
  requireThat(kind !== 'answer' || sender === 'guest', 'INVALID_ROLE');
  if (kind === 'ice') {
    requireThat(object(data) && typeof data.candidate === 'string' && data.candidate.length <= 4096 &&
      (data.sdpMid == null || typeof data.sdpMid === 'string' && data.sdpMid.length <= 256) &&
      (data.sdpMLineIndex == null || Number.isInteger(data.sdpMLineIndex) && data.sdpMLineIndex >= 0 && data.sdpMLineIndex <= 255), 'INVALID_SIGNAL');
  } else requireThat(object(data) && data.type === kind && text(data.sdp, 12000), 'INVALID_SIGNAL');
}
export function validateTransport(payload) {
  requireThat(['relay', 'p2p'].includes(payload.mode) && uint(payload.epoch) && payload.epoch > 0, 'INVALID_EPOCH');
}
export function validateGame(sender, epoch, msg) {
  requireThat(object(msg) && msg.v === 1 && msg.epoch === epoch && object(msg.payload), 'INVALID_GAME_MESSAGE');
  const p = msg.payload;
  if (msg.type === 'input') {
    requireThat(sender === 'guest' && msg.playerId === 'guest', 'INVALID_ROLE');
    requireThat(uint(msg.inputSeq) && uint(p.eventId) && p.eventId > 0 && uint(p.rallyId) && p.rallyId > 0 && uint(p.shotId), 'INVALID_GAME_MESSAGE');
    requireThat(['forehand', 'backhand', 'smash', 'volley', 'slice', 'lob', 'skill', 'character', 'serve', 'faultServe', 'letServe', 'netServe', 'rematch'].includes(p.kind) && bounded(p.power01, 0, 1) && bounded(p.aimX, -1, 1) && bounded(p.aimZ, -1, 1), 'INVALID_GAME_MESSAGE');
    if (p.kind === 'rematch') requireThat(text(p.matchId, 64) && (p.choice === 0 || p.choice === 1), 'INVALID_GAME_MESSAGE');
    if (p.kind === 'character') requireThat(Number.isInteger(p.choice) && p.choice >= 0 && p.choice < 15, 'INVALID_GAME_MESSAGE');
  } else {
    requireThat(sender === 'host', 'INVALID_ROLE');
    if (msg.type === 'snapshot') {
      requireThat(uint(msg.tick) && text(p.matchId, 64) && object(p.ball) && vector(p.ball.pos) && vector(p.ball.vel), 'INVALID_GAME_MESSAGE');
      requireThat(Array.isArray(p.players) && p.players.length === 2 && p.players[0]?.id === 'host' && p.players[1]?.id === 'guest' && p.players.every(x => vector(x.pos)), 'INVALID_GAME_MESSAGE');
      for (const player of p.players) for (const key of ['swingContact','swingServe']) if (player[key] != null) requireThat(typeof player[key] === 'boolean', 'INVALID_GAME_MESSAGE');
      if (p.rematchVotes != null) requireThat(Array.isArray(p.rematchVotes) && p.rematchVotes.length === 2 && p.rematchVotes.every(v => typeof v === 'boolean'), 'INVALID_GAME_MESSAGE');
      requireThat(Array.isArray(p.points) && p.points.length === 2 && p.points.every(n => Number.isInteger(n) && n >= 0 && n <= 1000000), 'INVALID_GAME_MESSAGE');
      requireThat(['WaitServe', 'InFlight', 'Rally', 'PointEnd', 'MatchEnd'].includes(p.phase) && role(p.serverId) && role(p.lastHitter) && ['left', 'right'].includes(p.serveSide), 'INVALID_GAME_MESSAGE');
      requireThat(Number.isInteger(p.faultCount) && p.faultCount >= 0 && p.faultCount <= 1 && Number.isInteger(p.bounceCount) && p.bounceCount >= 0 && p.bounceCount <= 100 && uint(p.rallyId) && p.rallyId > 0 && uint(p.shotId) && uint(p.lastProcessedInputSeq), 'INVALID_GAME_MESSAGE');
    } else if (msg.type === 'result') requireThat(text(p.matchId, 64) && role(p.winner), 'INVALID_GAME_MESSAGE');
    else if (msg.type === 'pause') requireThat(text(p.reason, 256), 'INVALID_GAME_MESSAGE');
    else throw new ProtocolError('INVALID_GAME_MESSAGE');
  }
}
