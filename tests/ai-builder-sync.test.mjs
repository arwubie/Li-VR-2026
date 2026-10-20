import test from 'node:test';
import assert from 'node:assert/strict';
import {commitCity,compareWorld} from '../js/util/ai-builder-sync.mjs';
import {EXAMPLES,expandCity} from '../js/util/ai-city.mjs';
const initial=()=>({version:0,blocks:{},objects:[],lastMessage:''});
const plan=(id,index=2,version=0)=>({op:'applyPlan',requestId:id,baseVersion:version,...expandCity({objects:[EXAMPLES[index]]})});
test('simultaneous plans converge in reversed message order, including already completed local plans',()=>{
 const a=plan('a'),b=plan('b',4),ha=new Map(),hb=new Map();
 let wa=commitCity(initial(),a,ha),wb=commitCity(initial(),b,hb);
 wa=commitCity(wa,b,ha)||wa;wb=commitCity(wb,a,hb)||wb;
 assert.deepEqual(wa,wb);assert.equal(Object.keys(wa.blocks).length,4);
 assert.equal(commitCity(wa,b,ha),null);assert.equal(compareWorld(wa,initial()),1);
});
test('clear wins same-version competition; edits preserve unrelated objects; snapshots are complete immediately',()=>{
 const history=new Map(),base=initial(),both=expandCity({objects:[EXAMPLES[2],{...EXAMPLES[2],position:[8,0]}]});
 const world=commitCity(base,{op:'applyPlan',requestId:'start',baseVersion:0,...both},history);
 assert.equal(Object.keys(world.blocks).length,both.actions.length);
 const edit=expandCity({objects:[{...EXAMPLES[2],height:9}]},{ids:['o0']});
 const updated=commitCity(world,{op:'applyPlan',requestId:'edit',baseVersion:1,targetId:'o0',...edit},history);
 assert.equal(updated.blocks['o1:p0'],world.blocks['o1:p0']);assert.equal(updated.objects[1],world.objects[1]);
 const clear={op:'clear',requestId:'clear',baseVersion:1};
 const cleared=commitCity(updated,clear,history);assert.deepEqual(cleared.blocks,{});
 assert.equal(commitCity(cleared,{op:'applyPlan',requestId:'z',baseVersion:1,...edit},history),null);
 assert.throws(()=>commitCity(world,{...plan('bad',2,1),actions:[{op:'place'}]},history));
});
