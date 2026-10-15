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
