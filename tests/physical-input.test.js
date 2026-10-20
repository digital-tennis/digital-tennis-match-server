import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGame} from '../src/protocol.js';
const kinds=['controllerPrimary','motionHorizontalPositive','motionHorizontalNegative','motionOverheadDown','motionShortRotation','motionObliqueDown','motionObliqueUp'];
const input=kind=>({v:1,type:'input',epoch:3,inputSeq:1,playerId:'guest',payload:{kind,eventId:1,rallyId:4,shotId:0,power01:.8,aimX:0,aimZ:0}});
test('neutral physical input reaches host without a server-side Serve/Smash decision',()=>{
 for(const kind of kinds){const p=input(kind);assert.doesNotThrow(()=>validateGame('guest',3,p));assert.equal(p.payload.kind,kind);}
});
test('physical kinds preserve authority/epoch/range constraints',()=>{
 assert.throws(()=>validateGame('host',3,input('motionOverheadDown')));
 assert.throws(()=>validateGame('guest',4,input('motionOverheadDown')));
 for(const kind of ['motionUnknown','MotionOverheadDown','motionOverheadDown\0'])assert.throws(()=>validateGame('guest',3,input(kind)));
 const p=input('motionOverheadDown');p.payload.power01=NaN;assert.throws(()=>validateGame('guest',3,p));
});
