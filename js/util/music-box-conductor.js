import * as cg from '../render/core/cg.js';

// Geometry is in human metres, matching HW7's .115/.13 m head and 1.7 m eye
// height. Only the viewer's existing presentation transform changes its scale.
export function createConductor(parent) {
   const root = parent.add(), body = root.add(), head = root.add();
   const skin = [1, .81, .69], coat = [.24, .48, .78], navy = [.12, .20, .35], gold = [.94, .73, .28];
   const shape = (p, form, position, scale, color) => p.add(form).move(position).scale(scale).color(color).dull();
   shape(body, 'sphere', [0, 1.10, 0], [.235, .34, .15], coat);
   shape(body, 'sphere', [0, .78, 0], [.20, .15, .13], navy);
   shape(body, 'tubeY', [0, 1.49, 0], [.065, .10, .065], skin);
   for (const x of [-.105, .105]) {
      shape(body, 'tubeY', [x, .405, 0], [.075, .36, .08], navy);
      shape(body, 'sphere', [x, .065, -.055], [.09, .065, .15], [.17, .12, .19]);
   }
   shape(body, 'cube', [0, 1.10, -.153], [.023, .25, .012], [1, .96, .86]);
   for (const y of [.96, 1.10, 1.24]) shape(body, 'sphere', [0, y, -.174], [.012, .012, .006], gold);
   for (const x of [-.04, .04]) shape(body, 'sphere', [x, 1.38, -.12], [.045, .025, .02], [.83, .28, .37]);
   shape(head, 'sphere', [0, 0, 0], [.115, .13, .11], skin);
   shape(head, 'sphere', [0, .075, .025], [.12, .075, .10], [.25, .13, .10]);
   shape(head, 'tubeY', [0, .15, .01], [.135, .045, .12], coat);
   shape(head, 'tubeY', [0, .113, .01], [.15, .009, .14], gold);
   for (const x of [-.043, .043]) shape(head, 'sphere', [x, .015, -.098], [.012, .016, .009], [.16, .10, .12]);
   shape(head, 'sphere', [0, -.014, -.112], [.023, .025, .025], skin);
   shape(head, 'sphere', [0, -.065, -.093], [.028, .008, .008], [.67, .22, .28]);
   for (const x of [-.12, .12]) shape(head, 'sphere', [x, -.005, 0], [.025, .04, .025], skin);
   const hands = {}, arms = {};
   for (const h of ['left', 'right']) {
      hands[h] = root.add();
      shape(hands[h], 'sphere', [0, 0, 0], [.065, .065, .065], [1, .96, .86]);
      shape(hands[h], 'tubeZ', [0, 0, -.075], [.025, .025, .065], gold);
      arms[h] = [shape(root, 'tubeY', [0, 0, 0], [0, 0, 0], coat),
         shape(root, 'tubeY', [0, 0, 0], [0, 0, 0], coat)];
   }
   const limb = (node, a, b) => {
      const d = cg.subtract(b, a), length = cg.norm(d);
      if (length < 1e-6) { node.identity().scale(0); return; }
      node.setMatrix(cg.mMultiply(cg.mTranslate(cg.mix(a, b, .5)), cg.mAimY(d))).scale(.055, length / 2, .055);
   };
   return {
      root, body, head, hands, arms,
      update(headPose, handPoses, boxMatrix, visible = true) {
         root.identity().scale(visible && headPose ? 1 : 0);
         if (!headPose || !visible) return;
         head.setMatrix(headPose);
         const worldHead = cg.mMultiply(boxMatrix, headPose), p = worldHead.slice(12, 15);
         const yaw = Math.atan2(-worldHead[8], -worldHead[10]) - Math.PI;
         const height = Math.max(.7, Math.min(1.3, p[1] / 1.7));
         const upright = cg.mMultiply(cg.mTranslate(p[0], 0, p[2]), cg.mMultiply(cg.mRotateY(yaw), cg.mScale(height)));
         const bodyMatrix = cg.mMultiply(cg.mInverse(boxMatrix), upright);
         body.setMatrix(bodyMatrix);
         for (const h of ['left', 'right']) {
            const pose = handPoses[h];
            hands[h].setMatrix(pose || cg.mScale(0));
            if (!pose) { arms[h].forEach(n => n.identity().scale(0)); continue; }
            const sgn = h === 'left' ? -1 : 1;
            const shoulder = cg.mTransform(bodyMatrix, [sgn * .235, 1.34, 0]);
            const wrist = pose.slice(12, 15), elbow = cg.mix(shoulder, wrist, .5);
            const outward = cg.mTransform(bodyMatrix, [sgn * .08, -.10, .08, 0]);
            for (let i = 0; i < 3; i++) elbow[i] += outward[i];
            limb(arms[h][0], shoulder, elbow); limb(arms[h][1], elbow, wrist);
         }
      },
   };
}
