'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');

test('returns complete validated JSON without waiting for a stalled CLI to exit',async()=>{
   const directory=fs.mkdtempSync(path.join(os.tmpdir(),'city-runner-test-'));
   const fakeCli=path.join(directory,'opencode');
   fs.writeFileSync(fakeCli,`#!${process.execPath}\nprocess.stdout.write(JSON.stringify({type:'text',part:{text:JSON.stringify({message:'ok',operations:[]})}})+'\\n');setInterval(()=>{},1000);\n`,{mode:0o755});
   const script=`require('./server/ai-builder.js').generatePlan({requestId:'test',instruction:'Build',anchor:[0,0,0],worldVersion:0}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1});`;
   try {
      const result=await new Promise((resolve,reject)=>{
         const c=spawn(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),env:{...process.env,OPENCODE_BIN:fakeCli},stdio:['ignore','pipe','pipe']});
         let out='',err='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>err+=d);
         const timer=setTimeout(()=>{c.kill();reject(new Error('Runner waited for CLI shutdown'));},8000);
         c.on('close',code=>{clearTimeout(timer);code===0?resolve(JSON.parse(out)):reject(new Error(err));});
         c.on('error',reject);
      });
      assert.equal(result.message,'ok');assert.deepEqual(result.actions,[]);
   } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('aborting a request stops a stalled model process and returns AbortError',async()=>{
   const directory=fs.mkdtempSync(path.join(os.tmpdir(),'city-cancel-test-'));
   const fakeCli=path.join(directory,'opencode');
   fs.writeFileSync(fakeCli,`#!${process.execPath}\nsetInterval(()=>{},1000);\n`,{mode:0o755});
   const script=`const c=new AbortController();setTimeout(()=>c.abort(),200);require('./server/ai-builder.js').generatePlan({requestId:'cancel-test',instruction:'Build',anchor:[0,0,0],worldVersion:0},{signal:c.signal}).then(()=>process.exitCode=1).catch(e=>{console.log(e.name);if(e.name!=='AbortError')process.exitCode=1});`;
   try {
      const result=await new Promise((resolve,reject)=>{
         const child=spawn(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),env:{...process.env,OPENCODE_BIN:fakeCli},stdio:['ignore','pipe','pipe']});
         let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
         const timer=setTimeout(()=>{child.kill();reject(new Error('Cancellation did not stop runner'));},8000);
         child.on('close',code=>{clearTimeout(timer);code===0?resolve(out.trim()):reject(new Error(err||out));});
         child.on('error',reject);
      });
      assert.equal(result,'AbortError');
   } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('a complete invalid model plan fails immediately instead of waiting for the model timeout',async()=>{
   const directory=fs.mkdtempSync(path.join(os.tmpdir(),'city-invalid-test-'));
   const fakeCli=path.join(directory,'opencode');
   fs.writeFileSync(fakeCli,`#!${process.execPath}\nprocess.stdout.write(JSON.stringify({type:'text',part:{text:JSON.stringify({objects:[]})}})+'\\n');setInterval(()=>{},1000);\n`,{mode:0o755});
   const script=`require('./server/ai-builder.js').generatePlan({mode:'city',requestId:'invalid-test',instruction:'Build',worldVersion:0}).then(()=>process.exitCode=1).catch(e=>{if(!e.isModelError)process.exitCode=1;console.log(e.message)});`;
   try {
      const result=await new Promise((resolve,reject)=>{
         const child=spawn(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),env:{...process.env,OPENCODE_BIN:fakeCli},stdio:['ignore','pipe','pipe']});
         let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
         const timer=setTimeout(()=>{child.kill();reject(new Error('Invalid plan waited for model timeout'));},8000);
         child.on('close',code=>{clearTimeout(timer);code===0?resolve(out):reject(new Error(err||out));});child.on('error',reject);
      });
      assert.match(result,/Return 1..100 individual objects/);
   } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('selected five-floor request is corrected before a model plan is accepted by the runner',async()=>{
   const directory=fs.mkdtempSync(path.join(os.tmpdir(),'city-floor-test-'));
   const fakeCli=path.join(directory,'opencode');
   const plan={objects:[['house',0,0,9,8,8,'wood','gable','purple']]};
   fs.writeFileSync(fakeCli,`#!${process.execPath}\nprocess.stdout.write(JSON.stringify({type:'text',part:{text:JSON.stringify(${JSON.stringify(plan)})}})+'\\n');setInterval(()=>{},1000);\n`,{mode:0o755});
   const body={mode:'city',requestId:'floor-test',instruction:'make it 5flour',worldVersion:0,target:{id:'o7',kind:'house',position:[0,0],height:6,width:8,depth:8,palette:'wood',roof:'gable',accent:'purple'}};
   const script=`require('./server/ai-builder.js').generatePlan(${JSON.stringify(body)}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1});`;
   try {
      const result=await new Promise((resolve,reject)=>{
         const child=spawn(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),env:{...process.env,OPENCODE_BIN:fakeCli},stdio:['ignore','pipe','pipe']});
         let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
         const timer=setTimeout(()=>{child.kill();reject(new Error('Corrected floor edit did not complete'));},8000);
         child.on('close',code=>{clearTimeout(timer);code===0?resolve(JSON.parse(out)):reject(new Error(err||out));});child.on('error',reject);
      });
      assert.equal(result.targetId,'o7');assert.equal(result.objects[0].height,15);
      assert.equal(result.actions.filter(a=>a.block==='purple'&&a.position[0]===-2.24&&a.position[2]===4.04).length,5);
   } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
