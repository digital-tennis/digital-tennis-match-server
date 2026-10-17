import { once } from 'node:events';
import { writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import WebSocket from 'ws';
import { startServer } from '../src/server.js';

const roomCount=Number(process.argv[2]??8),duration=Number(process.argv[3]??5);
if(!Number.isInteger(roomCount)||roomCount<1||roomCount>32||!Number.isInteger(duration)||duration<1||duration>60)throw new Error('Usage: node tools/load-check.mjs [rooms1..32] [seconds1..60]');
const app=await startServer({port:0});let sent=0,received=0,errors=0;const delays=[],peers=[];
class Peer {
  constructor(){this.ws=new WebSocket(app.url);this.sequence=0;this.queue=[];this.waiters=[];this.ws.on('message',data=>{const m=JSON.parse(data);if(m.type==='error'){errors++;return;}if(m.type==='relay.message'){received++;delays.push(performance.now()-m.payload.message.payload.sentAt);return;}this.queue.push(m);this.flush();});this.ws.on('error',()=>{errors++;});}
  flush(){for(const w of [...this.waiters]){const i=this.queue.findIndex(m=>m.type===w.type);if(i>=0){clearTimeout(w.timer);this.waiters.splice(this.waiters.indexOf(w),1);w.resolve(this.queue.splice(i,1)[0]);}}}
  next(type){return new Promise((resolve,reject)=>{const w={type,resolve,timer:setTimeout(()=>reject(new Error('Control timeout '+type)),5000)};this.waiters.push(w);this.flush();});}
  send(type,payload={}){this.ws.send(JSON.stringify({v:1,type,requestId:'load'+ ++this.sequence,payload}));}
}
let interval;
try {
  const pairs=[];
  for(let i=0;i<roomCount;i++){
    const host=new Peer(),guest=new Peer();peers.push(host,guest);await Promise.all([once(host.ws,'open'),once(guest.ws,'open')]);host.send('room.create');const {payload}=await host.next('room.created');guest.send('room.join',{code:payload.code});await guest.next('room.joined');await Promise.all([host.next('room.ready'),guest.next('room.ready')]);host.send('transport.propose',{epoch:1,mode:'relay'});await guest.next('transport.propose');guest.send('transport.ack',{epoch:1,mode:'relay'});await host.next('transport.ack');host.send('transport.commit',{epoch:1,mode:'relay'});await Promise.all([host.next('transport.committed'),guest.next('transport.committed')]);pairs.push({host,guest,seq:0});
  }
  const start=performance.now();interval=setInterval(()=>{
    for(const pair of pairs){const sequence=++pair.seq;pair.guest.send('game.relay',{epoch:1,message:{v:1,type:'input',epoch:1,inputSeq:sequence,playerId:'guest',payload:{eventId:sequence,kind:'forehand',power01:.5,aimX:0,aimZ:0,rallyId:1,shotId:1,sentAt:performance.now()}}});sent++;}
  },50);
  await new Promise(resolve=>setTimeout(resolve,duration*1000));clearInterval(interval);interval=null;
  const drain=performance.now()+3000;while(received<sent&&performance.now()<drain)await new Promise(resolve=>setTimeout(resolve,10));
  delays.sort((a,b)=>a-b);const percentile=p=>delays[Math.min(delays.length-1,Math.floor(delays.length*p))]??null;
  const report={scope:'Local actual WebSocket transport load, not Unity matches or public capacity',rooms:roomCount,clients:peers.length,seconds:(performance.now()-start)/1000,sent,received,relayed:app.rooms.relayCount,errors,p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),heapBytes:process.memoryUsage().heapUsed};
  if(errors||sent===0||received!==sent||app.rooms.relayCount!==sent||report.p95Ms>1000)throw new Error('Load check failed '+JSON.stringify(report));
  for(const pair of pairs)pair.host.send('room.leave');await new Promise(resolve=>setTimeout(resolve,100));if(app.rooms.rooms.size!==0)throw new Error('Rooms leaked after explicit leave');report.roomsAfterLeave=0;
  await mkdir('.work',{recursive:true});await writeFile('.work/load-validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} finally {if(interval)clearInterval(interval);for(const p of peers)p.ws.terminate();await app.stop();}
