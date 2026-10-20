// The browser demonstration and server expansion use exactly the same recipes.
export const CITY_LIMIT = 3200;
export const CITY_PROMPT = 'Make a large Minecraft-like city from these five individual examples. Copy and vary towers, houses, trees, lamps and benches. Put tall buildings at the back and smaller homes in front. Use mostly stone, wood and green, with subtle cyan and purple lights.';
export const EXAMPLES = [
   {kind:'tower',position:[0,0],height:24,width:8,depth:8,palette:'stone',roof:'spire'},
   {kind:'house',position:[0,0],height:6,width:8,depth:8,palette:'wood',roof:'gable'},
   {kind:'tree',position:[0,0],height:7,width:4,depth:4,palette:'green',roof:'flat'},
   {kind:'lamp',position:[0,0],height:6,width:2,depth:2,palette:'cyan',roof:'flat'},
   {kind:'bench',position:[0,0],height:2,width:4,depth:2,palette:'wood',roof:'flat'}
];
// Additional paired demonstrations make floor counts and size changes explicit.
export const VARIATIONS = [
   {...EXAMPLES[1],height:9,accent:'purple',label:'3 FLOORS'},
   {...EXAMPLES[1],height:15,accent:'purple',label:'5 FLOORS'},
   {...EXAMPLES[0],height:24,accent:'purple',label:'8 FLOORS'},
   {...EXAMPLES[2],label:'TREE'},
   {...EXAMPLES[2],height:14,width:8,depth:8,label:'TREE X2'}
];
export const PALETTES = {
   stone:[.36,.40,.46], wood:[.57,.37,.22], cream:[.79,.76,.64],
   cyan:[.20,.85,.89], purple:[.68,.40,.87], green:[.27,.55,.29],
   road:[.12,.15,.19], pavement:[.48,.51,.54], window:[.35,.76,.81],
   roof:[.23,.27,.32], leaf:[.25,.51,.25], trunk:[.37,.25,.15], gold:[.94,.74,.38]
};
const reject = message => {const e=new Error(message);e.isValidationError=true;throw e;};
export const validObjectId = id => typeof id === 'string' && /^o[0-9]{1,2}$/.test(id);
export const validPart = a => a && a.op==='place' && a.shape==='cube' &&
   typeof a.id==='string' && (/^p\d{1,4}$/.test(a.id) || /^o\d{1,2}:p\d{1,3}$/.test(a.id)) &&
   Array.isArray(a.position) && a.position.length===3 && a.position.every((v,i)=>Number.isFinite(v) && Math.abs(v)<=(i===1?40:48)) &&
   Array.isArray(a.size) && a.size.length===3 && a.size.every(v=>Number.isFinite(v)&&v>0&&v<=16) && Object.hasOwn(PALETTES,a.block) &&
   (a.objectId === undefined ? /^p\d{1,4}$/.test(a.id) : validObjectId(a.objectId) && a.id.startsWith(`${a.objectId}:p`));
export function expandCity(plan, {preset = false, ids = null} = {}) {
   const minimum = preset ? 40 : 1;
   if (!plan || !Array.isArray(plan.objects) || plan.objects.length<minimum || plan.objects.length>100)
      reject(`Return ${minimum}..100 individual objects; received ${plan?.objects?.length ?? 'no objects'}.`);
   const message = typeof plan.message === 'string' && plan.message.trim()
      ? plan.message.trim().slice(0,240) : 'AI city generated from the five examples.';
   const actions=[];
   // Compact model tuples reduce repeated JSON field names and generation latency.
   const objects = plan.objects.map(b => {
      if (!Array.isArray(b)) return b;
      if (b.length !== 8 && b.length !== 9) reject('Each compact object must contain 8 values, with an optional ninth accent.');
      return { kind:b[0], position:[b[1],b[2]], height:b[3], width:b[4], depth:b[5], palette:b[6], roof:b[7], accent:b[8] };
   });
   for (const [index, b] of objects.entries()) {
      if (!b || !Array.isArray(b.position) || b.position.length!==2 || !b.position.every(v=>Number.isInteger(v)&&v>=-36&&v<=36)) reject('Object position must be integer [x,z], each -36..36.');
      if (!['house','tower','tree','lamp','bench'].includes(b.kind) || !['flat','gable','spire','terrace'].includes(b.roof) || !['stone','wood','cream','cyan','purple','green'].includes(b.palette)) reject('Use the five demonstrated kinds and listed roofs/palettes.');
      if(b.accent !== undefined && !Object.hasOwn(PALETTES,b.accent)) reject('Invalid accent color.');
      const limits = b.kind==='tower'?[8,32,6,10]:b.kind==='house'?[3,30,6,10]:b.kind==='tree'?[4,24,3,16]:b.kind==='lamp'?[4,8,1,3]:[2,3,3,5];
      const [hMin,hMax,wMin,wMax]=limits;
      for (const [field,min,max] of [['height',hMin,hMax],['width',wMin,wMax],['depth',b.kind==='bench'?2:wMin,b.kind==='bench'?3:wMax]])
         if (!Number.isInteger(b[field])||b[field]<min||b[field]>max) reject(`${b.kind}.${field} must be integer ${min}..${max}.`);
      const objectId = ids ? ids[index] : `o${index}`;
      if (!validObjectId(objectId)) reject('Invalid object ID.');
      actions.push(...buildElement(b).map((part, partIndex) => ({...part, id:`${objectId}:p${partIndex}`, objectId})));
      objects[index] = {id:objectId,kind:b.kind,position:b.position.slice(),height:b.height,width:b.width,depth:b.depth,palette:b.palette,roof:b.roof,accent:b.accent || 'window'};
   }
   const kinds = new Set(objects.map(b=>b.kind));
   if(preset && EXAMPLES.some(b=>!kinds.has(b.kind))) reject('Include all five individual kinds.');
   if (new Set(objects.map(b=>b.id)).size !== objects.length) reject('Duplicate object IDs.');
   if(actions.length>CITY_LIMIT || !actions.every(validPart)) reject('Expanded city exceeds geometry bounds.');
   return {message,actions,objects,objectCount:plan.objects.length};
}
export function buildElement(b,origin=[b.position[0],0,b.position[1]]) {
   const parts=[],[x,y,z]=origin,w=b.width,d=b.depth,h=b.height,accent=b.accent || 'window';
   const box=(dx,dy,dz,sx,sy,sz,block)=>parts.push({op:'place',shape:'cube',position:[x+dx,y+dy,z+dz],size:[sx,sy,sz],block});
   if(b.kind==='tree') {
      box(0,h*.32,0,w*.1125,h*.32,d*.1125,'trunk');
      box(0,h*.68,0,w/2,h*.22,d/2,b.palette==='green'?'leaf':b.palette);
      box(0,h*.91,0,w*.34,h*.09,d*.34,b.palette);
   } else if(b.kind==='lamp') {
      box(0,.15,0,.55,.15,.55,'roof');box(0,h/2,0,.18,h/2,.18,'stone');
      box(w*.3,h,0,w*.45,.15,.22,'roof');box(w*.6,h-.35,0,.42,.25,.42,b.palette);
   } else if(b.kind==='bench') {
      for(const dx of [-w*.33,w*.33]) box(dx,h*.22,0,.23,h*.22,d*.33,'roof');
      box(0,h*.48,0,w/2,.16,d/2,b.palette);box(0,h*.78,-d*.4,w/2,h*.22,.16,b.palette);
   } else {
      box(0,.16,0,w/2+.6,.16,d/2+.6,'pavement');
      box(0,h/2+.4,0,w/2,h/2,d/2,b.palette);
      for(let floor=2;floor<h;floor+=3) {
         // Separated square windows suggest voxels without filling every wall with tiny cubes.
         for(const dx of [-w*.28,w*.28]) {
            box(dx,floor,d/2+.04,.55,.55,.06,accent);
            box(dx,floor,-d/2-.04,.55,.55,.06,accent);
         }
         box(w/2+.04,floor,0,.06,.55,d*.28,accent);box(-w/2-.04,floor,0,.06,.55,d*.28,accent);
      }
      box(0,1.1,d/2+.09,.6,.75,.1,'roof');
      if(b.roof==='gable') for(let i=0;i<4;i++) box(0,h+.65+i*.5,0,w/2+.3-i*w/9,.25,d/2+.3,'roof');
      else if(b.roof==='spire') {box(0,h+.7,0,w*.3,.3,d*.3,'roof');box(0,h+2.4,0,.2,1.4,.2,'cyan');}
      else if(b.roof==='terrace') {box(0,h+.55,0,w*.52,.15,d*.52,'roof');box(0,h+1.7,0,w*.29,1,d*.29,b.palette);}
      else box(0,h+.55,0,w*.53,.15,d*.53,'roof');
      if(b.kind==='tower') box(w/2+.1,h*.55,d*.35,.12,h*.35,.18,'purple');
   }
   return parts;
}
export const citySystemPrompt = (instruction, {preset = false} = {}) => `You are a VR geometric production assistant. Output exactly one JSON object, no tools, code or markdown.
Style: Minecraft-inspired cubic geometry, stone and wood, blocky green trees, subtle cyan/purple accents.
Learn FIVE INDIVIDUAL demonstrations (not districts): ${JSON.stringify(EXAMPLES)}
Additional size/floor demonstrations: ${JSON.stringify(VARIATIONS)}. One floor is exactly 3 height units. Five floors (including typo "5flour") means height 15 and FIVE windows in each vertical column, not three. Three floors = height 9; eight floors = height 24. A bigger tree must visibly increase height AND both crown dimensions by at least 50%; twice as big multiplies all three dimensions by 2.
Recipes use cubes only. Tower: stone body, repeated square windows every 3 height units, roof cap, optional cyan spire. House: wood body, door, square windows, four narrowing roof layers. Tree: trunk and two stacked cubic crowns. Lamp: base, thin pole, horizontal arm, glowing cube. Bench: two legs, wood seat and backrest. These exact recipes are visible in the scene. You choose parameters to copy and vary them.
${preset ? 'CITY DEMO: generate exactly 45 individual objects: 20 buildings plus 25 trees/lamps/benches, including ALL five kinds.' : 'CUSTOM REQUEST: follow the user brief and requested quantity exactly. Return 1..100 objects. If the user asks for one tree, return only one tree. Use only requested kinds; do not add a city, buildings or decorations unless asked. The examples teach recipes, not a required scene. For a large city without a quantity, aim for 45 objects.'}
Return {"message":"short design description","objects":[...]}. Use COMPACT ARRAYS for the output objects, each [kind,x,z,height,width,depth,palette,roof] with an optional ninth accent color for building windows. Accent may be window,cyan,purple,gold,cream,green,stone,wood. Preserve original accent on edits unless the user changes windows/lights. For example ["tower",-32,-32,24,8,8,"stone","spire"]. No repeated field names, no commentary, no planning text.
Position integer x,z in -36..36; positive z faces viewer. Roads are already drawn at x or z = -40,-24,-8,8,24,40; keep buildings clear. Suggested building centers: -32,-16,0,16,32, but decide the composition yourself. Keep footprints apart. For city requests only: put tall towers at negative z, low houses at positive z; scatter trees, lamps and benches beside buildings. Do not place small objects inside buildings.
Allowed kind and integer dimensions: tower height 8..32 width/depth 6..10; house height 3..30 width/depth 6..10; tree height 4..24 width/depth 3..16; lamp height 4..8 width/depth 1..3; bench height 2..3 width 3..5 depth 2..3.
Palette: stone,wood,cream,cyan,purple,green. Roof: flat,gable,spire,terrace. All 8 tuple values required even when a recipe ignores roof or palette. For a city request, vary skyline, roof, proportions and colors. Never return a district or park recipe. Return the complete objects array now.
User brief: ${JSON.stringify(instruction)}`;


export function validateObjectRecords(records) {
   if (!Array.isArray(records) || !records.length) return [];
   return expandCity({objects:records}, {ids:records.map(b=>b?.id)}).objects;
}

// Standard slab intersection in the city's local coordinates; also used by desktop and VR picking.
export function rayPartDistance(origin, direction, part) {
   let near = 0, far = Infinity;
   for (let axis=0; axis<3; axis++) {
      const min=part.position[axis]-part.size[axis], max=part.position[axis]+part.size[axis];
      if (Math.abs(direction[axis])<1e-8) {if(origin[axis]<min || origin[axis]>max) return null;continue;}
      let a=(min-origin[axis])/direction[axis],b=(max-origin[axis])/direction[axis];
      if(a>b) [a,b]=[b,a];
      near=Math.max(near,a);far=Math.min(far,b);
      if(near>far) return null;
   }
   return near;
}

// Enforce measurable edits after model output, before expansion. Other choices remain AI-generated.
export function constrainCityEdit(plan, target, instruction) {
   if (!target || !Array.isArray(plan?.objects) || plan.objects.length !== 1) return plan;
   let proposed=plan.objects[0];
   if(Array.isArray(proposed)) proposed={kind:proposed[0],position:[proposed[1],proposed[2]],height:proposed[3],width:proposed[4],depth:proposed[5],palette:proposed[6],roof:proposed[7],accent:proposed[8]};
   const b={...proposed,accent:proposed?.accent ?? target.accent};
   const text=instruction.toLowerCase();
   if(['house','tower'].includes(target.kind)) {
      const chinese={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
      const normalized=text.replace(/([一二三四五六七八九十])层/g,(_,n)=>`${chinese[n]}层`);
      const floor=normalized.match(/(\d+)\s*[- ]?\s*(?:floors?|flou?rs?|storeys?|stories|story|层)/i);
      if(floor) {
         const count=Number(floor[1]);
         if(count<1 || count>10) reject('Floor count must be 1..10.');
         b.kind=target.kind;
         b.height=count*3;
         // Short towers may use the house recipe, but preserve the selected kind.
         if(target.kind==='tower' && count<3) reject('Tower floor count must be 3..10.');
      }
   }
   if(target.kind==='tree' && /bigger|larger|enlarge|grow|大一点|更大|放大|变大|twice|double|两倍|倍|scale.*up/.test(text)) {
      const explicit=text.match(/(\d+(?:\.\d+)?)\s*(?:x|times|倍)/);
      const exact=!!explicit || /twice|double|两倍/.test(text);
      const factor=explicit?Number(explicit[1]):exact?2:1.5;
      b.kind='tree';
      if(!Number.isFinite(factor)||factor<=1||factor>6) reject('Tree enlargement factor must be greater than 1 and at most 6.');
      for(const [field,max] of [['height',24],['width',16],['depth',16]]) {
         const size=Math.ceil(target[field]*factor);
         if(size>max) reject(`Tree ${field} would exceed ${max}; use a smaller enlargement.`);
         b[field]=exact?size:Math.max(size,Number.isInteger(b[field])?b[field]:size);
      }
   }
   return {...plan,objects:[b]};
}
