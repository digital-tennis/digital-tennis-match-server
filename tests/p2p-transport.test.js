import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../src/rooms.js';
function setup() {
  const events=[],host={},guest={};
  const rooms=new RoomManager({generateCode:()=> 'ABCDEF',send:(client,message)=>events.push({client,...message})});
  rooms.handle(host,'room.create',{},'1');rooms.handle(guest,'room.join',{code:'ABCDEF'},'2');return {rooms,events,host,guest};
}
test('SDP/ICE and ready bind to negotiation epoch and socket role',()=>{
  const {rooms,events,host,guest}=setup();
  rooms.handle(host,'peer.signal',{epoch:1,kind:'offer',data:{type:'offer',sdp:'valid SDP'}},'3');
  assert.equal(events.at(-1).client,guest);assert.equal(events.at(-1).payload.epoch,1);
  rooms.handle(guest,'peer.ready',{epoch:1},'4');assert.equal(events.at(-1).payload.from,'guest');
  assert.throws(()=>rooms.handle(guest,'peer.signal',{epoch:1,kind:'offer',data:{type:'offer',sdp:'invalid role'}},'5'),{code:'INVALID_ROLE'});
  assert.throws(()=>rooms.handle(host,'peer.ready',{epoch:2},'6'),{code:'INVALID_EPOCH'});
});
test('direct channel failure negotiates fresh relay and never relays old direct epoch',()=>{
  const {rooms,events,host,guest}=setup();
  rooms.handle(host,'transport.propose',{mode:'p2p',epoch:1},'3');rooms.handle(guest,'transport.ack',{mode:'p2p',epoch:1},'4');rooms.handle(host,'transport.commit',{mode:'p2p',epoch:1},'5');
  rooms.handle(guest,'peer.failed',{epoch:1},'6');assert.equal(events.at(-1).type,'room.ready');assert.equal(events.at(-1).payload.preferRelay,true);assert.equal(events.at(-1).payload.epoch,1);
  const count=events.length;rooms.handle(host,'peer.failed',{epoch:1},'7');assert.equal(events.length,count);
  rooms.handle(host,'transport.propose',{mode:'relay',epoch:2},'8');rooms.handle(guest,'transport.ack',{mode:'relay',epoch:2},'9');rooms.handle(host,'transport.commit',{mode:'relay',epoch:2},'10');
  assert.equal(events.at(-1).payload.epoch,2);assert.equal(events.at(-1).payload.mode,'relay');
  assert.throws(()=>rooms.handle(host,'game.relay',{epoch:1,message:{}},'11'),{code:'INVALID_EPOCH'});
  assert.throws(()=>rooms.handle(guest,'peer.failed',{epoch:1},'12'),{code:'INVALID_EPOCH'});
});
test('channel failure during commit handshake supersedes late direct controls without granting authority',()=>{
  const {rooms,events,host,guest}=setup();rooms.handle(host,'transport.propose',{mode:'p2p',epoch:1},'3');
  rooms.handle(guest,'peer.failed',{epoch:1},'4');assert.equal(events.at(-1).payload.preferRelay,true);assert.equal(events.at(-1).payload.epoch,0);
  rooms.handle(guest,'transport.ack',{mode:'p2p',epoch:1},'5');assert.equal(events.at(-1).type,'transport.superseded');
  rooms.handle(host,'transport.commit',{mode:'p2p',epoch:1},'6');assert.equal(events.at(-1).type,'transport.superseded');assert.notEqual(rooms.rooms.get('ABCDEF').state,'PLAYING');
  assert.throws(()=>rooms.handle(guest,'transport.commit',{mode:'p2p',epoch:1},'7'),{code:'NOT_HOST'});
  rooms.handle(host,'transport.propose',{mode:'relay',epoch:1},'8');rooms.handle(guest,'transport.ack',{mode:'relay',epoch:1},'9');rooms.handle(host,'transport.commit',{mode:'relay',epoch:1},'10');assert.equal(events.at(-1).payload.mode,'relay');
});
