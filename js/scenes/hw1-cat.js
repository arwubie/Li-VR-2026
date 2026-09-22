/* hw1-cat: a feather wand, yarn ball, laser pointer, and playful cat. */

import * as cg from '../render/core/cg.js';
import { ControllerBeam } from '../render/core/controllerInput.js';

let cleanup;

export const init = async model => {
   cleanup?.();
   const previousInput = {
      onPress: inputEvents.onPress,
      onDrag: inputEvents.onDrag,
      onRelease: inputEvents.onRelease,
   };
   const orange = [ .74, .34, .13 ];
   const darkOrange = [ .46, .20, .09 ];
   const cream = [ .83, .72, .54 ];
   const ink = [ .13, .10, .08 ];
   const toyScale = 2 / 3;
   const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
   const mix = (a, b, t) => a + (b - a) * t;
   const pulse = (hand, strength, duration) => {
      if (typeof vibrate === 'function') vibrate(hand, strength, duration);
   };

   let line = (parent, a, b, radius, color) => {
      let direction = cg.subtract(b, a);
      let length = cg.norm(direction);
      return parent.add('tubeY').move(cg.mix(a, b, .5))
                   .aimY(direction).scale(radius, length / 2, radius).color(color);
   };
   let placeLine = (node, a, b, radius) =>
      node.identity().move(cg.mix(a, b, .5)).aimY(cg.subtract(b, a))
          .scale(radius, cg.distance(a, b) / 2, radius);

   //scene root
   let scene = model.add().dull();
   scene.add('cube').move(0,-.035,-1.35).scale(1.6,.025,1.2).color(.28,.38,.33);
   scene.add('cube,rounded').move(0,.002,-1.30).scale(1.15,.012,.75).color(.62,.72,.59);
   scene.add('cube').move(0,.9,-2.55).scale(1.8,.9,.025).color(.79,.83,.79);
   scene.add('cube').move(0,.10,-2.51).scale(1.8,.11,.035).color(.91,.91,.83);
   let cushion = scene.add('cube,rounded').move(-.95,.075,-1.85).scale(.27,.065,.24).color(.64,.31,.32);
   cushion.add('cube,rounded').move(0,.55,0).scale(.79,.16,.78).color(.81,.51,.49);

   //cat shape hierarchy
   let cat = scene.add();
   let body = cat.add('sphere').move(0,.33,-.10).scale(.24,.20,.35).color(orange);
   let chest = cat.add('sphere').move(0,.27,.16).scale(.13,.14,.11).color(cream);

   let head = cat.add().move(0,.49,.27);
   head.add('sphere').scale(.22,.20,.19).color(orange);
   let eyes = [];
   for (let side of [-1,1]) {
      head.add('coneY').move(side*.145,.20,-.02).turnZ(-side*.20)
           .scale(.085,.14,.07).color(orange);
      eyes.push(head.add('sphere').move(side*.085,.035,.173)
                    .scale(.023,.032,.017).color(ink));
      head.add('sphere').move(side*.055,-.09,.15).scale(.075,.045,.06).color(cream);
      for (let i = -1; i <= 1; i++)
         line(head, [side*.11,-.08+i*.016,.19],
                    [side*.30,-.06+i*.035,.20], .0025, cream);
   }
   head.add('sphere').move(0,-.065,.213).scale(.029,.020,.016).color(darkOrange);

   let paws = [];
   for (let side of [-1,1]) {
      let paw = cat.add().move(side*.16,.27,.14);
      paw.add('sphere').move(0,-.13,.09).scale(.09,.15,.10).color(orange);
      paws.push(paw);
   }
   let hindLegs = [];
   for (let side of [-1,1]) {
      let leg = cat.add().move(side*.17,.28,-.32);
      leg.add('sphere').move(0,-.08,-.02).scale(.11,.17,.12).color(orange);
      leg.add('sphere').move(0,-.23,.045).scale(.105,.055,.13).color(darkOrange);
      hindLegs.push(leg);
   }
   let tail = cat.add().move(0,.36,-.43);
   tail.add('sphere').move(0,.10,-.035).scale(.075,.17,.08).color(orange);
   let tailTip = tail.add().move(0,.22,-.07);
   tailTip.add('sphere').move(0,.09,-.015).scale(.07,.15,.07).color(darkOrange);

   let featherRest = [.52,1.05,-.65];
   let feather = { pos: featherRest.slice(), prevX: featherRest[0],
                   holder: null, angle: 0, omega: 0, length: .22*toyScale,
                   lurePos: [.52,.59,-.75], tug: 0, wasReachable: false };
   feather.root = scene.add().move(featherRest).scale(toyScale);
   feather.root.add('sphere').scale(.046,.09,.046).color(.38,.25,.16);
   feather.grip = feather.root.add('sphere').move(0,.07,0).scale(.049,.024,.049)
                           .color(.78,.66,.40);
   feather.target = feather.root.add('square').move(0,0,.04)
                                .scale(.15,.19,1).opacity(0);
   line(feather.root, [0,-.05,0], [0,-.46,-.15], .014, [.58,.43,.27]);
   feather.tip = feather.root.add().move(0,-.46,-.15);
   feather.string = scene.add('tubeY').color(.82,.82,.73);
   feather.lure = scene.add();
   feather.lure.add('sphere').move(0,-.035,0).scale(.025,.08,.018).color(.96,.96,.91);
   line(feather.lure, [0,-.19,0], [0,-.11,0], .003, [.83,.83,.79]);

   let ballRest = [-.52,.067,-.85];
   let ball = { pos: ballRest.slice(), prev: ballRest.slice(), velocity: [0,0,0],
                holder: null, flying: false, batted: false, launchedAt: -10, spin: 0 };
   ball.root = scene.add().move(ballRest).scale(toyScale);
   ball.root.add('sphere').scale(.085).color(.55,.69,.67);
   ball.grip = ball.root.add('torusX').scale(.064).color(.38,.56,.55);
   ball.root.add('torusY').turnX(.35).scale(.064).color(.72,.81,.76);
   ball.root.add('torusZ').turnY(.45).scale(.064).color(.42,.61,.59);
   line(ball.root, [0,-.07,.04], [.10,-.10,.09], .005, [.38,.56,.55]);
   ball.target = ball.root.add('square').move(0,0,.07).scale(.14,.14,1).opacity(0);

   let laserPlane = scene.add('square').move(0,.018,-1.30)
                         .turnX(-Math.PI/2).scale(1.14,.74,1).opacity(0);
   let laserDot = scene.add('sphere').scale(0).color(1,.08,.06);
   let beams = { left: new ControllerBeam(scene, 'left'),
                 right: new ControllerBeam(scene, 'right') };
   let holding = { left: null, right: null };
   let laser = { left: false, right: false };
   let laserPos = null;
   let catPos = { x: 0, z: -1.35 };
   let lastTime = 0, lastTug = 0, lastPounce = -10, pounceStart = -10, pounceKind = null;
   let lastStretch = -10, stretchStart = -10, pounceArmed = true, squint = 0;
   let lastTouch = { left: 0, right: 0 };
   let backTouch = { left: false, right: false };

   const onPress = hand => {
      let p = inputEvents.pos(hand);
      if (!p || holding[hand]) return;
      beams[hand].update();
      let options = [
         { name: 'feather', owner: feather.holder, pos: feather.pos,
           target: feather.target, radius: .12 },
         { name: 'ball', owner: ball.holder, pos: ball.pos,
           target: ball.target, radius: .11 },
      ];
      let candidates = options.filter(option => !option.owner).map(option => {
         let distance = cg.distance(p, option.pos);
         let hit = beams[hand].hitRect(option.target.getGlobalMatrix());
         return { name: option.name,
                  score: distance < option.radius ? distance : hit ? hit[2]+1 : Infinity };
      }).sort((a,b) => a.score-b.score);
      if (candidates.length && candidates[0].score < Infinity) {
         let name = candidates[0].name;
         holding[hand] = name;
         if (name === 'feather') {
            feather.holder = hand;
            feather.pos = p.slice();
            feather.prevX = p[0];
         }
         else {
            ball.holder = hand;
            ball.pos = ball.prev = p.slice();
            ball.velocity = [0,0,0];
            ball.flying = ball.batted = false;
         }
         pulse(hand, .35, 55);
      }
      else if (beams[hand].hitRect(laserPlane.getGlobalMatrix())) {
         holding[hand] = 'laser';
         laser[hand] = true;
      }
   };
   const onDrag = hand => {
      let p = inputEvents.pos(hand);
      if (!p) return;
      if (holding[hand] === 'feather') feather.pos = p.slice();
      if (holding[hand] === 'ball') ball.pos = p.slice();
   };
   const onRelease = hand => {
      let name = holding[hand];
      if (name === 'feather') feather.holder = null;
      if (name === 'ball') {
         ball.holder = null;
         ball.flying = true;
         ball.batted = false;
         ball.launchedAt = model.time;
         ball.velocity = [clamp(ball.velocity[0],-1.4,1.4),
                          clamp(ball.velocity[1]+.7,.7,1.8),
                          clamp(ball.velocity[2]-.7,-1.8,.5)];
      }
      if (name === 'laser') laser[hand] = false;
      if (name && name !== 'laser')
         pulse(hand, .18, 40);
      holding[hand] = null;
   };
   const callbacks = { onPress, onDrag, onRelease };
   Object.assign(inputEvents, callbacks);
   cleanup = () => {
      for (let key in callbacks)
         if (inputEvents[key] === callbacks[key]) inputEvents[key] = previousInput[key];
   };

   const updateFeather = dt => {
      if (!feather.holder)
         for (let i = 0; i < 3; i++)
            feather.pos[i] = mix(feather.pos[i], featherRest[i], clamp(dt*3,0,1));
      let dx = feather.pos[0]-feather.prevX;
      feather.prevX = feather.pos[0];
      feather.root.identity().move(feather.pos).scale(toyScale);
      let featherHover = !feather.holder &&
         (beams.left.hitRect(feather.target.getGlobalMatrix()) ||
          beams.right.hitRect(feather.target.getGlobalMatrix()));
      feather.grip.color(feather.holder || featherHover ? [.31,.70,.66] : [.78,.66,.40]);
      let tip = feather.tip.getGlobalPos();
      feather.omega += (-9.8/feather.length*Math.sin(feather.angle)-1.8*feather.omega)*dt
                       - clamp(dx*16,-.30,.30);
      feather.omega = clamp(feather.omega,-5,5);
      feather.angle = clamp(feather.angle+feather.omega*dt,-.70,.70);
      feather.lurePos = [tip[0]+feather.length*Math.sin(feather.angle),
                         tip[1]-feather.length*Math.cos(feather.angle), tip[2]];
      feather.lure.identity().move(feather.lurePos).turnZ(-feather.angle*.45).scale(toyScale);
      placeLine(feather.string, tip, feather.lurePos, .0017);
   };

   const updateBall = dt => {
      if (ball.holder) {
         let p = inputEvents.pos(ball.holder);
         if (p) ball.pos = p.slice();
         if (dt > 0) ball.velocity = ball.pos.map((v,i) =>
            clamp((v-ball.prev[i])/dt,-2,2));
         ball.prev = ball.pos.slice();
      }
      else if (ball.flying) {
         ball.velocity[1] -= 3.4*dt;
         for (let i = 0; i < 3; i++) ball.pos[i] += ball.velocity[i]*dt;
         if (ball.pos[1] < ballRest[1]) {
            ball.pos[1] = ballRest[1];
            ball.velocity[1] = ball.velocity[1] < -.25 ? -ball.velocity[1]*.32 : 0;
            ball.velocity[0] *= Math.max(0,1-2*dt);
            ball.velocity[2] *= Math.max(0,1-2*dt);
         }
         for (let axis of [0,2]) {
            let lo = axis === 0 ? -1.05 : -1.92;
            let hi = axis === 0 ? 1.05 : -.60;
            if (ball.pos[axis] < lo || ball.pos[axis] > hi) {
               ball.pos[axis] = clamp(ball.pos[axis],lo,hi);
               ball.velocity[axis] *= -.35;
            }
         }
      }
      else for (let i = 0; i < 3; i++)
         ball.pos[i] = mix(ball.pos[i],ballRest[i],clamp(dt*1.5,0,1));
      if (ball.flying)
         ball.spin += Math.hypot(ball.velocity[0],ball.velocity[2])*dt/.085;
      ball.root.identity().move(ball.pos).turnZ(ball.spin).scale(toyScale);
      let ballHover = !ball.holder &&
         (beams.left.hitRect(ball.target.getGlobalMatrix()) ||
          beams.right.hitRect(ball.target.getGlobalMatrix()));
      ball.grip.color(ball.holder || ballHover ? [.28,.75,.73] : [.38,.56,.55]);
   };

   const updateLaser = () => {
      laserPos = null;
      for (let hand of ['left','right'])
         if (laser[hand]) {
            let p = beams[hand].hitPoint(laserPlane.getGlobalMatrix());
            if (p) laserPos = [p[0],.025,p[2]];
         }
      laserDot.identity();
      if (laserPos) laserDot.move(laserPos).scale(.035,.008,.035);
      else laserDot.scale(0);
   };

   const updateCat = (t, dt) => {
      let ballReady = ball.flying && !ball.batted && t-ball.launchedAt > .55;
      let focus = ballReady ? 'ball' : feather.holder ? 'feather' : laserPos ? 'laser' : null;
      let target = focus === 'ball' ? ball.pos :
                   focus === 'feather' ? feather.lurePos : laserPos || [0,.28,-1.05];
      let goalX = focus ? clamp(target[0],-.70,.70) : 0;
      let chaseOffset = focus === 'feather' ? .20 : .08;
      let goalZ = focus ? clamp(target[2]-chaseOffset,-1.80,-.80) : -1.35;
      let toGoalX = goalX-catPos.x, toGoalZ = goalZ-catPos.z;
      let goalDistance = Math.hypot(toGoalX,toGoalZ);
      let moving = goalDistance > .035;
      let step = Math.min(goalDistance,.48*dt);
      if (goalDistance > 0) {
         catPos.x += toGoalX/goalDistance*step;
         catPos.z += toGoalZ/goalDistance*step;
      }

      let horizontal = cg.distance([target[0],0,target[2]],[catPos.x,0,catPos.z]);
      let high = focus === 'feather' && target[1] > .42 && horizontal < .46;
      let close = (focus === 'laser' || focus === 'ball' && target[1] < .17) &&
                  horizontal < .16;
      if (!focus || focus === 'feather' && target[1] < .30 ||
          focus !== 'feather' && horizontal > .30) pounceArmed = true;
      if ((high || close) && pounceArmed && t-lastPounce > 2.5 && t-lastStretch > 1.1) {
         pounceStart = lastPounce = t;
         pounceKind = focus;
         pounceArmed = false;
      }
      let pouncePhase = (t-pounceStart)/.82;
      let pounce = pouncePhase >= 0 && pouncePhase < 1 ? Math.sin(Math.PI*pouncePhase) : 0;
      let stretchPhase = (t-stretchStart)/1.15;
      let stretch = stretchPhase >= 0 && stretchPhase < 1 ? Math.sin(Math.PI*stretchPhase) : 0;
      let walk = moving ? Math.sin(t*12)*.01 : 0;

      cat.identity().move(catPos.x,walk+(focus === 'feather' ? .17 : .11)*pounce,catPos.z)
         .turnY(clamp((target[0]-catPos.x)*.55,-.32,.32))
         .turnX(-.14*pounce).scale(.68*toyScale);
      body.identity().move(0,.33+.11*stretch,-.10-.05*stretch)
          .scale(.24,.20+.04*stretch,.35+.07*stretch);
      chest.identity().move(0,.27+.03*stretch,.16+.02*stretch).scale(.13,.14,.11);
      head.identity().move(0,.49-.08*stretch,.27+.04*stretch)
          .turnY(clamp((target[0]-catPos.x)*.60,-.30,.30))
          .turnX(-.07*stretch-.10*pounce);
      for (let i = 0; i < paws.length; i++)
         paws[i].identity().move((i ? 1 : -1)*.16,.27,.14+.18*stretch)
              .turnX(-.55*pounce + (moving ? Math.sin(t*12+i*Math.PI)*.20 : 0));
      for (let i = 0; i < hindLegs.length; i++)
         hindLegs[i].identity().move((i ? 1 : -1)*(.17+.025*stretch),.28,-.32-.08*stretch)
                    .turnX(.16*stretch + (moving ? Math.sin(t*12+(i+1)*Math.PI)*.10 : 0));
      tail.identity().move(0,.36,-.43).turnZ(Math.sin(t*3.4)*.38+.20*stretch);
      tailTip.identity().move(0,.22,-.07).turnZ(Math.sin(t*4.2+.8)*.47);
      return { focus, pouncePhase };
   };

   const updateToyContact = (t, dt, focus, pouncePhase) => {
      let mouth = cg.mTransform(head.getGlobalMatrix(),[0,-.08,.20]);
      if (focus === 'feather') {
         let reachable = cg.distance(feather.lurePos,mouth) < .16;
         feather.tug = mix(feather.tug,reachable ? 1 : 0,clamp(dt*8,0,1));
         if (reachable && !feather.wasReachable)
            feather.omega += feather.lurePos[0] < catPos.x ? -.8 : .8;
         feather.wasReachable = reachable;
         if (feather.tug > .6 && t-lastTug > .15) {
            pulse(feather.holder,.52,65);
            lastTug = t;
         }
      }
      else {
         feather.tug = mix(feather.tug,0,clamp(dt*8,0,1));
         feather.wasReachable = false;
      }
      for (let i = 0; i < paws.length; i++)
         if (feather.tug > .2) paws[i].turnX(feather.tug*.32);
      if (focus === 'ball' && pounceKind === 'ball' && !ball.batted &&
          ball.launchedAt < pounceStart &&
          pouncePhase > .45 && pouncePhase < 1) {
         ball.batted = true;
         ball.velocity = [clamp(ball.pos[0]*.4,-.35,.35),.75,1.15];
      }
   };

   const updatePetting = (t, dt) => {
      let headTouched = false;
      let headCenter = head.getGlobalPos();
      let backCenter = body.getGlobalPos();
      for (let hand of ['left','right']) {
         if (holding[hand]) {
            backTouch[hand] = false;
            continue;
         }
         let p = inputEvents.pos(hand);
         let onHead = p && cg.distance(p,headCenter) < .12;
         let onBack = p && !onHead && cg.distance(p,backCenter) < .13;
         if (onHead) {
            headTouched = true;
            if (t-lastTouch[hand] > .09) {
               pulse(hand,.17,105);
               lastTouch[hand] = t;
            }
         }
         else if (onBack && t-lastTouch[hand] > .18) {
            pulse(hand,.11,60);
            lastTouch[hand] = t;
         }
         if (onBack && !backTouch[hand] && t-lastStretch > 3.8 &&
             t-lastPounce > 1.0)
            stretchStart = lastStretch = t;
         backTouch[hand] = !!onBack;
      }
      squint = mix(squint,headTouched ? 1 : 0,clamp(dt*10,0,1));
      for (let i = 0; i < eyes.length; i++)
         eyes[i].identity().move((i ? 1 : -1)*.085,.035,.173)
                .scale(.023,.032*(1-.84*squint),.017);
   };

   const updateFrame = () => {
      let t = model.time;
      let dt = clamp(t-lastTime, 0, .05);
      lastTime = t;
      for (let hand in beams) beams[hand].update();
      updateFeather(dt);
      updateBall(dt);
      updateLaser();
      let { focus, pouncePhase } = updateCat(t, dt);
      updateToyContact(t, dt, focus, pouncePhase);
      updatePetting(t, dt);
   };
   model.animate(updateFrame);
};

export const deinit = () => { cleanup?.(); cleanup = null; };
