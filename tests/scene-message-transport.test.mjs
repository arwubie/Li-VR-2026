import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {initialPose,editPose,mergePose} from '../js/util/so101-state.mjs';
import {commitCity} from '../js/util/ai-builder-sync.mjs';
import {expandCity,EXAMPLES} from '../js/util/ai-city.mjs';
// Exercise the repository's real Server.send/sync batching, not a fake echo transport.
function pair(name,initial,receive){
 const source=fs.readFileSync(new URL('../server/client.js',import.meta.url),'utf8');
 const packets=[],peers=[];
 for(let id=0;id<2;id++){
   const ctx=vm.createContext({name:'',console,Date,clients:[0,1],clientID:id,isMasterClient:()=>id===0});
   ctx.window=ctx;vm.runInContext(source,ctx);
   // No socket/persistence needed: retain real message batching and reception.
   vm.runInContext('Server = '+vm.runInContext('Server.toString()',ctx).replace('this.connectSocket(wsPort);',''),ctx);
   ctx.server=vm.runInContext('new Server()',ctx);ctx.server.neverLoadOrSave();
   ctx.server.broadcastObject=packet=>packets.push({id,packet:structuredClone(packet)});
   ctx.server.init(name,initial());peers.push(ctx);
 }
 const tick=()=>{
   for(let i=0;i<2;i++)peers[i].server.sync(name,messages=>receive(peers[i],messages,i));
   for(const {id,packet} of packets.splice(0))peers[1-id][packet.global]=packet.value;
 };
 return {peers,tick};
}
test('SO101 converges across actual construct-style message batches, duplicate echoes and old snapshots',()=>{
 const local=[initialPose(),initialPose()];
 const {peers,tick}=pair('pose',initialPose,(ctx,messages,i)=>{for(const message of Object.values(messages))local[i]=mergePose(local[i],message.state);ctx.pose=local[i];});
 local[0]=editPose(local[0],'desktop','joint',0,.9,1000);local[1]=editPose(local[1],'vr','joint',1,-.6,1000);
 for(let i=0;i<2;i++)peers[i].server.send('pose',{state:local[i]});
 for(let i=0;i<4;i++)tick();assert.deepEqual(local[0],local[1]);
 peers[0].server.send('pose',{state:initialPose()});for(let i=0;i<4;i++)tick();assert.deepEqual(local[0],local[1]);assert.equal(local[0].revision,1);
});
test('AI Builder concurrent local plans converge through actual message transport',()=>{
 const initial=()=>({version:0,blocks:{},objects:[],lastMessage:''}),history=[new Map(),new Map()];
 const {peers,tick}=pair('city',initial,(ctx,messages,i)=>{for(const message of Object.values(messages))ctx.city=commitCity(ctx.city,message,history[i])||ctx.city;});
 for(let i=0;i<2;i++){
   const plan={op:'applyPlan',requestId:i?'vr':'desktop',baseVersion:0,...expandCity({objects:[EXAMPLES[i?4:2]]})};
   peers[i].city=commitCity(peers[i].city,plan,history[i]);peers[i].server.send('city',plan);
 }
 for(let i=0;i<4;i++)tick();assert.deepEqual(peers[0].city,peers[1].city);assert.equal(Object.keys(peers[0].city.blocks).length,4);
});

test('analysis snapshots and clear generations converge on real message batches and a recorder can take over',async()=>{
 const {initialAnalysis,editAnalysis,mergeAnalysis,sampleTool,recorderId}=await import('../js/util/so101-analysis.mjs');
 const now=20000,local=[initialAnalysis(),initialAnalysis()];
 const {peers,tick}=pair('analysis',initialAnalysis,(ctx,messages,i)=>{
   for(const m of Object.values(messages))local[i]=mergeAnalysis(local[i],m.state,now);
   ctx.analysis=local[i];
 });
 const point=sampleTool(null,[.1,.2,.3],now,'a',0);
 local[0]=mergeAnalysis(local[0],{...local[0],points:[point]},now);
 peers[0].server.send('analysis',{state:local[0]});for(let i=0;i<4;i++)tick();
 assert.deepEqual(local[0],local[1]);assert.equal(local[1].points.length,1);
 const old=structuredClone(local[0]);
 local[1]=editAnalysis(local[1],'b','clear',null,now);peers[1].server.send('analysis',{state:local[1]});
 for(let i=0;i<4;i++)tick();assert.deepEqual(local[0],local[1]);assert.equal(local[0].points.length,0);
 peers[0].server.send('analysis',{state:old});for(let i=0;i<4;i++)tick();assert.equal(local[1].points.length,0);
 assert.equal(recorderId(new Map([['a',now-4000],['b',now]]),now),'b');
 const replacement=sampleTool(point,[.2,.2,.3],now,'b',0);assert.equal(replacement.start,true);
 local[1]=mergeAnalysis(local[1],{...local[1],points:[replacement]},now);peers[1].server.send('analysis',{state:local[1]});
 for(let i=0;i<4;i++)tick();assert.deepEqual(local[0],local[1]);assert.equal(local[0].points[0].writer,'b');
});
