import test from 'node:test';
import assert from 'node:assert/strict';
import {createBuilderScreen} from '../js/util/ai-builder-screen.mjs';

test('spatial screen uses a scene texture, shows only essential state and never mounts HTML',()=>{
   const oldDocument=globalThis.document,oldWindow=globalThis.window;
   const drawn=[],removed=[];
   const ctx={fillRect(){},strokeRect(){},fillText(value){drawn.push(value);},measureText(value){return {width:value.length*18};}};
   const canvas={getContext:()=>ctx};
   globalThis.document={createElement(tag){assert.equal(tag,'canvas');return canvas;}};
   globalThis.window={_canvas_txtr:[],txtrChannel:[1,3]};
   const face={move(){return this;},scale(){return this;},color(){return this;},dull(){return this;},setTxtr(source,once){assert.equal(source,canvas);assert.equal(once,true);this._txtr=3;window._canvas_txtr[3]={counter:1};return this;}};
   const panel={add(shape){assert.equal(shape,'square');return face;},remove(node){removed.push(node);}};
   try {
      const screen=createBuilderScreen(panel);
      window._canvas_txtr[3].counter=0;
      screen.update({draft:'建一棵树',status:'AI THINKING',selected:null,edit:false,elapsed:12,progress:'',error:'',message:'AI answer must not appear',detail:'Explanation must not appear'});
      assert.ok(drawn.includes('建一棵树'));assert.ok(drawn.includes('WAITING 12s'));assert.ok(drawn.includes('NEW SCENE'));
      assert.ok(!drawn.some(value=>value.includes('must not appear')));
      assert.equal(window._canvas_txtr[3].counter,1);
      drawn.length=0;
      screen.update({draft:'',status:'DONE',selected:{kind:'tree',id:'o0'},edit:true,elapsed:0,progress:'',error:'',message:'Another unwanted AI reply'});
      assert.ok(drawn.includes('EDIT  /  TREE o0'));assert.ok(drawn.includes('DONE'));
      assert.ok(!drawn.some(value=>value.includes('reply')));
      screen.destroy();assert.deepEqual(removed,[face]);assert.equal(window._canvas_txtr[3],undefined);assert.deepEqual(window.txtrChannel,[1]);
   } finally {
      if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
      if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;
   }
});
