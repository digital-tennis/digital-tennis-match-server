import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGame } from '../src/protocol.js';
const input = (kind, choice = 0) => ({v:1,type:'input',epoch:1,playerId:'guest',inputSeq:1,
  payload:{eventId:1,rallyId:1,shotId:1,kind,choice,power01:.35,aimX:0,aimZ:0}});
test('tennis techniques and skill intent relay only from the bound guest role',()=>{
  for(const kind of ['forehand','backhand','smash','volley','slice','lob','skill']) {
    assert.doesNotThrow(()=>validateGame('guest',1,input(kind)));
    assert.throws(()=>validateGame('host',1,input(kind)));
  }
});
test('roster selection validates all fifteen indices',()=>{
  for(let i=0;i<15;i++) assert.doesNotThrow(()=>validateGame('guest',1,input('character',i)));
  for(const i of [-1,15,1.5,'1',null]) assert.throws(()=>validateGame('guest',1,input('character',i)));
});
test('skill requests cannot bypass epoch, event identity or normalized input checks',()=>{
  assert.throws(()=>validateGame('guest',2,input('skill')));
  const malformed=input('skill'); malformed.payload.power01=NaN;
  assert.throws(()=>validateGame('guest',1,malformed));
  assert.throws(()=>validateGame('guest',1,input('win-point')));
});
test('guest service intents preserve host authority and still validate context and ranges',()=>{
  for(const kind of ['serve','faultServe','letServe','netServe']) {
    assert.doesNotThrow(()=>validateGame('guest',1,input(kind)));
    assert.throws(()=>validateGame('host',1,input(kind)));
    assert.throws(()=>validateGame('guest',2,input(kind)));
    const invalid=input(kind);invalid.payload.rallyId=0;
    assert.throws(()=>validateGame('guest',1,invalid));
  }
});

test('rematch is a bounded guest consent intent, never a result or authority grant',()=>{
  const vote=input('rematch',1);vote.payload.matchId='finished-match';
  assert.doesNotThrow(()=>validateGame('guest',1,vote));
  vote.payload.choice=0;assert.doesNotThrow(()=>validateGame('guest',1,vote));
  for(const bad of [-1,2,'1',null]){vote.payload.choice=bad;assert.throws(()=>validateGame('guest',1,vote));}
  vote.payload.choice=1;vote.payload.matchId='';assert.throws(()=>validateGame('guest',1,vote));
  vote.payload.matchId='finished-match';assert.throws(()=>validateGame('host',1,vote));
  assert.throws(()=>validateGame('guest',2,vote));
});
