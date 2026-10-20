'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const city=import('../js/util/ai-city.mjs');
const plan=examples=>({message:'A voxel city',objects:Array.from({length:50},(_,i)=>({...examples[i%5],position:[(i%5-2)*16,(Math.floor(i/5)%5-2)*16]}))});
test('five individual demonstrations expand into a bounded cubic city with stable unique IDs',async()=>{
   const {EXAMPLES,expandCity,validPart,CITY_LIMIT}=await city;
   const {actions,objectCount}=expandCity(plan(EXAMPLES));
   assert.equal(objectCount,50);assert.ok(actions.length>300&&actions.length<=CITY_LIMIT);
   assert.ok(actions.every(validPart));assert.equal(new Set(actions.map(a=>a.id)).size,actions.length);
});
test('rejects incomplete scenes and unsafe object parameters',async()=>{
   const {EXAMPLES,expandCity}=await city;
   const p=plan(EXAMPLES);p.objects=[];assert.throws(()=>expandCity(p),/1..100/);
   for(const [field,value] of [['height',Infinity],['width',100],['kind','javascript'],['palette','__proto__'],['position',[-99,0]]]){
      const p=plan(EXAMPLES);p.objects[0][field]=value;assert.throws(()=>expandCity(p));
   }
});
test('all building roof combinations fit the geometry budget at maximum height',async()=>{
   const {EXAMPLES,expandCity,validPart}=await city;
   for(const roof of ['flat','gable','spire','terrace']){
      const p=plan(EXAMPLES);p.objects.forEach(b=>{if(b.kind==='tower')Object.assign(b,{roof,height:32,width:10,depth:10});});
      assert.ok(expandCity(p).actions.every(validPart));
   }
});


test('compact model tuples preserve the same geometry and reject malformed tuples',async()=>{
   const {EXAMPLES,expandCity}=await city;
   const p=plan(EXAMPLES);
   const compact={...p,objects:p.objects.map(b=>[b.kind,...b.position,b.height,b.width,b.depth,b.palette,b.roof])};
   assert.deepEqual(expandCity(compact),expandCity(p));
   compact.objects[0].pop();assert.throws(()=>expandCity(compact),/8 values/);
});

test('long model descriptions are truncated without rejecting valid geometry',async()=>{
   const {EXAMPLES,expandCity}=await city;
   const p=plan(EXAMPLES);p.message='A'.repeat(500);
   assert.equal(expandCity(p).message.length,240);
});

test('custom requests allow one kind and one object; city preset keeps full-scene rules',async()=>{
   const {EXAMPLES,expandCity,citySystemPrompt}=await city;
   const p={message:'One tree',objects:[EXAMPLES.find(b=>b.kind==='tree')]};
   assert.equal(expandCity(p).objectCount,1);
   assert.throws(()=>expandCity(p,{preset:true}),/40..100/);
   assert.match(citySystemPrompt('One tree'),/return only one tree/);
   assert.match(citySystemPrompt('City',{preset:true}),/CITY DEMO/);
});

test('selected-object IDs and window accents survive expansion; ray picking uses actual cube bounds',async()=>{
   const {EXAMPLES,expandCity,rayPartDistance,validateObjectRecords}=await city;
   const original={...EXAMPLES[0],accent:'purple'};
   const result=expandCity({objects:[original]},{ids:['o7']});
   assert.equal(result.objects[0].id,'o7');assert.equal(result.objects[0].accent,'purple');
   assert.ok(result.actions.every(a=>a.objectId==='o7'&&a.id.startsWith('o7:')));
   assert.ok(result.actions.some(a=>a.block==='purple'));
   assert.deepEqual(validateObjectRecords(result.objects),result.objects);
   assert.throws(()=>validateObjectRecords([{...original,id:'not-an-id'}]));
   const part={position:[0,0,0],size:[1,1,1]};
   assert.equal(rayPartDistance([0,0,5],[0,0,-1],part),4);
   assert.equal(rayPartDistance([2,0,5],[0,0,-1],part),null);
   assert.equal(rayPartDistance([0,0,5],[0,0,1],part),null);
});

test('five-floor edits override a three-row model answer and keep five purple windows per column',async()=>{
   const {EXAMPLES,expandCity,constrainCityEdit}=await city;
   const target={...EXAMPLES[1],id:'o7',accent:'purple'};
   for(const instruction of ['make it 5flour','5 floors','变成五层']) {
      const constrained=constrainCityEdit({objects:[['house',0,0,9,8,8,'wood','gable']]},target,instruction);
      const result=expandCity(constrained,{ids:['o7']});
      assert.equal(result.objects[0].height,15);
      const column=result.actions.filter(a=>a.block==='purple'&&a.position[0]===-8*.28&&a.position[2]===4.04);
      assert.deepEqual(column.map(a=>a.position[1]),[2,5,8,11,14]);
      assert.equal(result.objects[0].id,'o7');
   }
});

test('bigger trees visibly grow in all dimensions; explicit doubling and size limits are enforced',async()=>{
   const {EXAMPLES,expandCity,constrainCityEdit,VARIATIONS}=await city;
   const target={...EXAMPLES[2],id:'o2'};
   for(const instruction of ['make this tree bigger','树要大一点']) {
      const result=expandCity(constrainCityEdit({objects:[target]},target,instruction));
      assert.equal(result.objects[0].height,11);
      assert.equal(result.objects[0].width,6);assert.equal(result.objects[0].depth,6);
      assert.equal(result.actions[0].size[0],6*.1125);
   }
   const doubled=constrainCityEdit({objects:[target]},target,'twice as big').objects[0];
   assert.deepEqual([doubled.height,doubled.width,doubled.depth],[14,8,8]);
   assert.throws(()=>constrainCityEdit({objects:[target]},target,'6x bigger'),/exceed/);
   assert.ok(expandCity({objects:VARIATIONS}).actions.length>0);
});
