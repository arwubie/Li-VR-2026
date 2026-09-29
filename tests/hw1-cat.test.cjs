const assert = require('assert');
const fs = require('fs');

async function main() {
   const cgSource = fs.readFileSync('js/render/core/cg.js', 'utf8');
   const cg = await import('data:text/javascript,' + encodeURIComponent(cgSource));
   const sceneSource = fs.readFileSync('js/scenes/hw1-cat.js', 'utf8')
      .replace(/^import .*;\n/gm, '')
      .replace('export const init', 'const init')
      .replace('export const deinit', 'const deinit');

   const nodes = [];
   class Node {
      constructor(parent = null, form = null) {
         this.parent = parent;
         this.form = form;
         this.children = [];
         this.matrix = cg.mIdentity();
         if (parent) parent.children.push(this);
         nodes.push(this);
      }
      add(form) { return new Node(this, form); }
      identity() { this.matrix = cg.mIdentity(); return this; }
      move(x, y, z) { this.matrix = cg.mMultiply(this.matrix, cg.mTranslate(x, y, z)); return this; }
      scale(x, y, z) { this.lastScale = [x, y, z]; this.matrix = cg.mMultiply(this.matrix, cg.mScale(x, y, z)); return this; }
      turnX(a) { this.matrix = cg.mMultiply(this.matrix, cg.mRotateX(a)); return this; }
      turnY(a) { this.matrix = cg.mMultiply(this.matrix, cg.mRotateY(a)); return this; }
      turnZ(a) { this.matrix = cg.mMultiply(this.matrix, cg.mRotateZ(a)); return this; }
      aimY(v) { this.matrix = cg.mMultiply(this.matrix, cg.mAimY(v)); return this; }
      color() { return this; }
      dull() { return this; }
      opacity(value) { this.alpha = value; return this; }
      animate(fn) { this.step = fn; return this; }
      getGlobalMatrix() {
         return this.parent ? cg.mMultiply(this.parent.getGlobalMatrix(), this.matrix) : this.matrix;
      }
      getGlobalPos() { return this.getGlobalMatrix().slice(12, 15); }
   }

   let aim = null;
   let laserPoint = null;
   class Beam {
      update() {}
      hitRect(matrix) {
         let x = matrix[12], y = matrix[13], z = matrix[14];
         if (aim === 'laser' && y < .04 && z < -1) return [0, 0, 1];
         if (aim === 'feather' && x > .3 && y > .5) return [0, 0, 1];
         if (aim === 'ball' && x < -.2 && z < -.72) return [0, 0, 1];
         return null;
      }
      hitPoint(matrix) { return this.hitRect(matrix) ? laserPoint : null; }
   }

   const handPos = { left: [3, 3, 3], right: [3, 3, 3] };
   const inputEvents = { pos: hand => handPos[hand] };
   const pulses = [];
   const { init, deinit } = new Function('cg', 'ControllerBeam', 'inputEvents', 'vibrate',
      sceneSource + '\nreturn { init, deinit };')(cg, Beam, inputEvents,
      (hand, strength, duration) => pulses.push({ hand, strength, duration }));

   const model = new Node();
   model.time = 0;
   const oldPress = inputEvents.onPress;
   await init(model);
   const scene = model.children[0];
   const targets = nodes.filter(node => node.alpha === 0 && node.form === 'square');
   const featherTarget = targets.find(node => node.getGlobalPos()[0] > .3);
   const ballTarget = targets.find(node => node.getGlobalPos()[0] < -.2 && node.getGlobalPos()[2] < -.72);
   assert(featherTarget && ballTarget);
   const featherRoot = featherTarget.parent;
   const ballRoot = ballTarget.parent;
   const cat = scene.children.find(node =>
      node.children.some(child => child.children.some(part => part.form === 'coneY')));
   const head = cat.children.find(node => node.children.some(child => child.form === 'coneY'));
   const body = cat.children.find(node => node.form === 'sphere');
   const paws = cat.children.filter(node => !node.form && node.children.some(child =>
      child.form === 'sphere' && child.lastScale?.[0] === .09));
   const hindLegs = cat.children.filter(node => !node.form && node.children.some(child =>
      child.form === 'sphere' && child.lastScale?.[0] === .105));
   const featherLure = scene.children.find(node => node.children.some(child =>
      child.form === 'sphere' && child.lastScale?.[1] === .08));
   const dot = scene.children.find(node => node.form === 'sphere' && node.lastScale?.[0] === 0);
   assert(cat && head && body && dot);
   assert.strictEqual(paws.length, 2, 'cat has two front legs');
   assert.strictEqual(hindLegs.length, 2, 'cat has two visible hind legs');
   assert.strictEqual(ballRoot.children.filter(node => node.form?.startsWith('torus')).length, 3,
      'yarn ball has three wrapped strands');
   assert(featherLure && featherLure.children.length === 2,
      'feather lure is one oval and one thin shaft');

   let frame = 0;
   const step = (count = 1) => {
      for (let i = 0; i < count; i++) {
         model.time = ++frame / 60;
         model.step();
      }
   };
   step();
   assert(Math.abs(cat.lastScale[0] - .68*2/3) < .001);
   assert(Math.abs(featherRoot.lastScale[0] - 2/3) < .001);
   assert(Math.abs(ballRoot.lastScale[0] - 2/3) < .001);

   aim = 'feather';
   inputEvents.onPress('right');
   assert(pulses.some(p => p.hand === 'right' && p.strength === .35));
   aim = null;
   handPos.right = [.1, 1.1, -.6];
   inputEvents.onDrag('right');
   step(50);
   assert(Math.abs(featherRoot.getGlobalPos()[0] - .1) < .01);
   inputEvents.onRelease('right');
   step(100);

   aim = 'ball';
   inputEvents.onPress('right');
   aim = null;
   handPos.right = [-.45, .45, -.75];
   inputEvents.onDrag('right');
   step();
   assert(Math.abs(ballRoot.getGlobalPos()[1] - .45) < .01, 'ball follows the hand');
   inputEvents.onRelease('right');
   const beforeThrow = ballRoot.getGlobalPos().slice();
   const catBeforeThrow = cat.getGlobalPos().slice();
   step(20);
   assert(cg.distance(beforeThrow, ballRoot.getGlobalPos()) > .04, 'ball travels after release');
   assert(cg.distance(catBeforeThrow, cat.getGlobalPos()) < .17,
      'cat waits before chasing the thrown ball');
   let ballPounce = false;
   let ballBatted = false;
   for (let i = 0; i < 240; i++) {
      const beforeZ = ballRoot.getGlobalPos()[2];
      step();
      ballPounce ||= cat.getGlobalPos()[1] > .08;
      ballBatted ||= ballPounce && ballRoot.getGlobalPos()[2] > beforeZ + .01;
   }
   assert(ballPounce, 'cat pounces during the ball chase');
   assert(ballBatted, 'cat bats the ball back toward the player');

   aim = 'laser';
   laserPoint = [.25, .018, -1.2];
   inputEvents.onPress('left');
   step();
   const beforeLaserJump = cat.getGlobalPos().slice();
   laserPoint = [-1, .018, -1.2];
   step();
   assert(cg.distance(beforeLaserJump,cat.getGlobalPos()) <= .48/60+.005,
      'cat cannot teleport with a fast laser movement');
   laserPoint = [.25, .018, -1.2];
   let laserPounce = false;
   for (let i = 0; i < 90; i++) {
      step();
      laserPounce ||= cat.getGlobalPos()[1] > .08;
   }
   assert(Math.abs(dot.getGlobalPos()[0] - .25) < .01 && dot.lastScale[0] > 0,
      'laser beam produces a visible rug dot');
   assert(cat.getGlobalPos()[0] > .05, 'cat follows the laser dot');
   assert(laserPounce, 'cat pounces at a nearby laser dot');
   inputEvents.onRelease('left');
   step();
   assert(dot.lastScale[0] === 0, 'dot disappears on release');

   handPos.right = head.getGlobalPos();
   const beforePet = pulses.filter(p => p.hand === 'right' && p.strength === .17).length;
   step(20);
   assert(pulses.filter(p => p.hand === 'right' && p.strength === .17).length > beforePet + 1,
      'head touch keeps sending gentle controller pulses');
   handPos.right = body.getGlobalPos();
   step(3);
   const bodyStart = body.getGlobalPos()[1];
   const pawStart = paws.map(paw => paw.matrix[14]);
   const hindStart = hindLegs.map(leg => leg.getGlobalPos()[2]);
   step(20);
   assert(body.getGlobalPos()[1] > bodyStart + .01, 'back touch stretches the cat');
   assert(paws.every((paw,i) => paw.matrix[14] > pawStart[i]+.05),
      'both front legs step forward during the stretch');
   assert(hindLegs.every((leg,i) => leg.getGlobalPos()[2] < hindStart[i]-.01),
      'both hind legs extend backward during the stretch');

   deinit();
   assert.strictEqual(inputEvents.onPress, oldPress, 'scene restores prior input handlers');

   console.log('hw1-cat: smaller cat and toys, yarn ball, feather, stretch, laser, cat responses passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
