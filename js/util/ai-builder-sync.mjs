import {CITY_LIMIT,validPart,validateObjectRecords} from './ai-city.mjs';
export const commitKey=m=>m.op==='clear'?`z:${m.requestId}`:`p:${m.requestId}`;
export function compareWorld(a,b){return a.version-b.version || ((a.commitId||'')>(b.commitId||'')?1:(a.commitId||'')<(b.commitId||'')?-1:0);}
// Commit complete geometry atomically. Animation must never be the shared data store.
export function commitCity(world,message,history){
 if(!message || !['clear','applyPlan'].includes(message.op)||!Number.isSafeInteger(message.baseVersion)||message.baseVersion<0||typeof message.requestId!=='string')return null;
 const key=commitKey(message),baseVersion=message.baseVersion;
 if(world.version>baseVersion+1||world.version<baseVersion)return null;
 if(world.version===baseVersion+1&&(world.commitId||'')>=key)return null;
 const base=world.version===baseVersion?world:history.get(baseVersion);
 if(!base)return null;
 let blocks={},objects=[];
 if(message.op==='applyPlan'){
   const actions=message.actions;
   if(!Array.isArray(actions)||!actions.length||actions.length>CITY_LIMIT||!actions.every(validPart)||new Set(actions.map(a=>a.id)).size!==actions.length)throw new Error('Invalid shared geometry.');
   objects=validateObjectRecords(message.objects||[]);
   if(actions.some(a=>!objects.some(o=>o.id===a.objectId)))throw new Error('Geometry does not match objects.');
   if(message.targetId){
     const id=message.targetId;
     if(!base.objects.some(o=>o.id===id)||objects.length!==1||objects[0].id!==id||actions.some(a=>a.objectId!==id))throw new Error('Invalid selected-object edit.');
     blocks=Object.fromEntries(Object.entries(base.blocks).filter(([,a])=>a.objectId!==id));
     objects=base.objects.map(o=>o.id===id?objects[0]:o);
   }
   for(const action of actions)blocks[action.id]=action;
   if(Object.keys(blocks).length>CITY_LIMIT)throw new Error('Geometry budget exceeded.');
 }
 history.set(baseVersion,base);
 for(const version of history.keys())if(version<baseVersion-2)history.delete(version);
 return {version:baseVersion+1,commitId:key,blocks,objects,lastMessage:message.op==='clear'?'World cleared':String(message.message||'AI build plan').slice(0,240)};
}
