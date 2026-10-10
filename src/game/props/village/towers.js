// Tall round structures: windmill_body and tower_observatory.  Angles: phi measured from +Z toward +X (rotateY convention).
import {
  PI, TAU, clamp, lerp, mixc, mulc, TINT, vgrad, grid, fan, quadUV, cells, frustum, planar, arcPt, column, polar, strut, annulus, cylBand, archUnit,
} from './common.js';
import { doorUnit, windowUnit, lanternBody } from './details.js';

const DEG = PI / 180;

/** Run fn with the transform on a facet of an N-gon tower: facet k (centre angle k*TAU/N), at height y, wall tilted by `tilt`. */
function facet(kit, N, k, apo, y, tilt, fn) {
  const phi = (k * TAU) / N;
  kit.xf.push().translate(Math.sin(phi) * apo, y, Math.cos(phi) * apo).rotateY(phi);
  if (tilt) kit.xf.rotateX(-tilt);
  fn();
  kit.xf.pop();
}

/** One step / slab of a helical stair: radial extent rIn..rOut at angle phi, tangential length arc, top at yTop. */
function stepBox(kit, b, phi, rIn, rOut, arc, yTop, thick, o = {}) {
  const rc = (rIn + rOut) / 2;
  const cx = Math.sin(phi) * rc, cz = Math.cos(phi) * rc;
  kit.xf.push().translate(cx, 0, cz).rotateY(phi);
  b.box(0, yTop - thick / 2, 0, arc, thick, rOut - rIn, { tile: o.tile || 2.4, color: o.color, emissive: o.emissive, faces: o.faces || ['+y', '+z', '-z', '+x', '-x'] });
  kit.xf.pop();
  if (o.collide !== false) kit.box(cx, cz, arc / 2, (rOut - rIn) / 2, yTop - thick, yTop, { top: true, rot: phi, tag: o.tag || 'step' });
}

/** Post + rails along a polyline of [x,y,z] top points (post tops); simple square posts and two rails. */
function railPost(kit, wb, x, yBase, z, h, w = 0.18, color) {
  wb.box(x, yBase + h / 2, z, w, h, w, { tile: 2.4, color, faces: ['+z', '-z', '+x', '-x', '+y'] });
}

// ---------------------------------------------------------------------------------------------------------------
// windmill_body
// ---------------------------------------------------------------------------------------------------------------
export function windmillBody(kit, p) {
  const { x, z, rot = 0, scale = 1, y } = p;
  kit.at(x, z, { rot, scale, y }, () => {
    const N = 12, rr = -PI / N, APO = Math.cos(PI / N);
    const R = (yy) => 5.5 - 0.1 * yy, TILT = Math.atan(0.1);
    const Ht = 15.0;
    const wood = kit.b('wood_plank'), beam = kit.b('wood_beam');
    const woodTint = [1.05, 0.98, 0.92];

    // ---- tower shell: stone base band + whitewashed upper band, faceted
    kit.b('brick').lathe([[R(-0.9), -0.9], [R(1.8), 1.8], [R(4.5), 4.5]], N, { tile: 3.0, uWrap: 11, smooth: false, rot: rr, emissive: 0.22, color: vgrad(-0.9, [0.6, 0.58, 0.66], 3.0, [1.06, 1.02, 1.1]) });
    kit.b('plaster').lathe([[R(4.5), 4.5], [R(9.0), 9.0], [R(12.0), 12.0], [R(Ht), Ht]], N, { tile: 3.0, uWrap: 11, smooth: false, rot: rr, emissive: 0.24, color: vgrad(4.5, [1.06, 1.0, 0.98], Ht, [0.92, 0.88, 0.92]) });
    // timber ring under the cap
    wood.lathe([[R(14.2) + 0.13, 14.2], [R(Ht) + 0.13, Ht]], N, { tile: 2.4, uWrap: 11, smooth: false, rot: rr, color: [0.85, 0.72, 0.66] });
    // ---- wooden cone cap
    const rc = 4.95;
    kit.b('wood_plank').lathe([[R(Ht) + 0.1, Ht], [rc, Ht], [rc, Ht + 0.55], [rc * 0.55, Ht + 3.3], [0, Ht + 5.6]], N, { tile: 3.0, uWrap: 10, smooth: false, rot: rr, emissive: 0.2, color: vgrad(Ht, [0.9, 0.62, 0.56], Ht + 5.6, [1.15, 0.9, 0.78]) });
    kit.xf.push().translate(0, Ht + 5.55, 0);
    kit.b('metal_brass').cyl(0.24, 0.0, 1.7, 6, { tile: 1.6, smooth: false, emissive: 0.3 });
    kit.xf.translate(0, 1.7, 0);
    kit.b('metal_brass').sphere(0.28, 6, 3, { tile: 1.6, smooth: false, emissive: 0.4 });
    kit.xf.pop();

    // ---- balcony deck ring (C-shaped: open toward the sails) with railing
    const yD = 9.0, rDi = 4.3, rDo = 7.2, a0 = 35 * DEG, a1 = 325 * DEG, nD = 24;
    annulus(wood, rDi, rDo, yD, a0, a1, nD, { tile: 3.0, color: woodTint, emissive: 0.2 });
    annulus(wood, rDi, rDo, yD - 0.5, a0, a1, nD, { tile: 3.0, up: false, color: [0.62, 0.56, 0.56] });
    cylBand(wood, rDo, yD - 0.5, yD, a0, a1, nD, { tile: 3.0, color: [0.8, 0.7, 0.66] });
    {
      const P = (r, phi, yy) => polar(r, phi, yy);
      wood.quad(P(rDi, a0, yD - 0.5), P(rDo, a0, yD - 0.5), P(rDo, a0, yD), P(rDi, a0, yD), { tile: 3.0, color: [0.8, 0.7, 0.66] });
      wood.quad(P(rDo, a1, yD - 0.5), P(rDi, a1, yD - 0.5), P(rDi, a1, yD), P(rDo, a1, yD), { tile: 3.0, color: [0.8, 0.7, 0.66] });
    }
    // brackets under the deck
    for (let i = 0; i < 8; i++) {
      const ph = a0 + ((a1 - a0) * (i + 0.5)) / 8;
      strut(beam, polar(4.4, ph, 6.3), polar(6.85, ph, 8.45), 0.4, { color: [0.85, 0.7, 0.6] });
    }
    // railing runs (leave the stair arrival open: 190..212 deg)
    const railRot = (A, B) => Math.atan2(-(B[2] - A[2]), B[0] - A[0]);   // yaw so local +x runs from A to B
    const rail = (pa, pb, r, yBase, collide = true) => {
      const n = Math.max(1, Math.ceil((pb - pa) / (24 * DEG)));
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const ph = pa + ((pb - pa) * i) / n;
        const q = polar(r, ph, yBase);
        railPost(kit, beam, q[0], yBase, q[2], 1.15, 0.2, [0.9, 0.78, 0.7]);
        if (prev) {
          strut(wood, [prev[0], yBase + 1.05, prev[2]], [q[0], yBase + 1.05, q[2]], 0.13, { color: [0.95, 0.84, 0.76], faces: ['+z', '-z', '+x', '-x', '+y'] });
          strut(wood, [prev[0], yBase + 0.55, prev[2]], [q[0], yBase + 0.55, q[2]], 0.11, { color: [0.85, 0.75, 0.68], faces: ['+z', '-z', '+x', '-x', '+y'] });
          if (collide) {
            const mx = (prev[0] + q[0]) / 2, mz = (prev[2] + q[2]) / 2, len = Math.hypot(q[0] - prev[0], q[2] - prev[2]);
            kit.box(mx, mz, len / 2, 0.12, yBase, yBase + 1.15, { rot: railRot(prev, q), tag: 'rail' });
          }
        }
        prev = q;
      }
    };
    rail(a0, 190 * DEG, rDo - 0.15, yD);
    rail(212 * DEG, a1, rDo - 0.15, yD);
    // deck colliders (walkable ring), one box per 24-degree sector
    for (let i = 0; i < 12; i++) {
      const ph = a0 + ((a1 - a0) * (i + 0.5)) / 12;
      const rc2 = (rDi + rDo) / 2, c = polar(rc2, ph);
      kit.box(c[0], c[2], 1.6, (rDo - rDi) / 2, yD - 0.5, yD, { top: true, rot: ph, tag: 'balcony' });
    }
    // beacon pad on the deck at phi=180 (anchor)
    {
      const bp = polar(5.75, PI, yD);
      kit.xf.push().translate(bp[0], yD, bp[2]);
      kit.b('brick').cyl(1.0, 0.85, 0.5, 8, { tile: 3.0, smooth: false, caps: 'top', color: [1.0, 0.96, 1.06], emissive: 0.22 });
      kit.xf.pop();
      const s = 1.9;
      kit.b('rune_ring', { mode: 'add', decal: true }).disc(s * 0.98, 28, { y: yD + 0.07, uvDisc: true, emissive: 0.8, color: [0.7, 0.66, 0.85] });          // (light on the stone: a disc, not a dark square plate)
    }

    // ---- exterior wooden stair: r 7.4..9.8, from phi=55deg, 7.5deg per step, 0.5 rise
    const rsi = 7.4, rso = 9.8, phi0 = 55 * DEG, dph = 7.5 * DEG;
    const stepTop = (k) => (k < 8 ? 0.5 * (k + 1) : k < 11 ? 4.5 : 4.5 + 0.5 * (k - 10));
    const phiC = (k) => phi0 + (k + 0.5) * dph;
    const stepColor = [1.02, 0.94, 0.88];
    const landPhi = phi0 + 9.5 * dph;               // the landing is ONE slab covering slots 8, 9 and 10
    for (let k = 0; k < 20; k++) {
      if (k === 9 || k === 10) continue;
      const land = k === 8;
      const yT = stepTop(k), ph = land ? landPhi : phiC(k);
      const arc = land ? 3 * dph * rso * 1.02 : dph * rso * 1.03;
      stepBox(kit, wood, ph, k >= 16 ? rDo - 0.05 : rsi, rso, arc, yT, 0.7, { color: stepColor, emissive: 0.2, tag: land ? 'landing' : 'step' });
    }
    // support posts
    for (const k of [2, 5, 8, 10, 13, 16, 19]) {
      const yT = stepTop(k), ph = k === 8 ? phi0 + 8.7 * dph : k === 10 ? phi0 + 10.3 * dph : phiC(k);
      for (const r of [rsi + 0.2, rso - 0.2]) {
        const q = polar(r, ph);
        beam.box(q[0], (yT - 0.7 - 2.4) / 2, q[2], 0.42, yT - 0.7 + 2.4, 0.42, { tile: 2.4, color: [0.85, 0.72, 0.64], faces: ['+z', '-z', '+x', '-x'] });
      }
    }
    // hand rails (outer all the way, inner up to the gate)
    {
      let prevO = null, prevI = null;
      for (let k = 0; k < 20; k++) {
        if (k === 9 || k === 10) continue;
        const yT = stepTop(k), ph = k === 8 ? landPhi : phiC(k);
        if (k % 2 === 1 || k === 0 || k === 19 || k === 8) {
          const qo = polar(rso - 0.14, ph, yT);
          railPost(kit, beam, qo[0], yT, qo[2], 1.1, 0.17, [0.92, 0.8, 0.72]);
          if (prevO) {
            strut(wood, [prevO[0], prevO[1] + 1.0, prevO[2]], [qo[0], qo[1] + 1.0, qo[2]], 0.12, { color: [0.95, 0.84, 0.76], faces: ['+z', '-z', '+x', '-x', '+y'] });
            const mx = (prevO[0] + qo[0]) / 2, mz = (prevO[2] + qo[2]) / 2;
            kit.box(mx, mz, Math.hypot(qo[0] - prevO[0], qo[2] - prevO[2]) / 2, 0.1, Math.max(prevO[1], qo[1]), Math.max(prevO[1], qo[1]) + 1.1, { rot: railRot(prevO, qo), tag: 'rail' });
          }
          prevO = qo;
          if (k <= 8 && k > 0) {
            const qi = polar(rsi + 0.14, ph, yT);
            railPost(kit, beam, qi[0], yT, qi[2], 1.1, 0.17, [0.92, 0.8, 0.72]);
            if (prevI) strut(wood, [prevI[0], prevI[1] + 1.0, prevI[2]], [qi[0], qi[1] + 1.0, qi[2]], 0.12, { color: [0.95, 0.84, 0.76], faces: ['+z', '-z', '+x', '-x', '+y'] });
            prevI = qi;
          }
        }
      }
    }
    // ---- gate frame at the end of the landing (phi_g), a portcullis sits in the opening
    const phiG = phi0 + 11 * dph, yG = 4.5;
    {
      const rm = (rsi + rso) / 2;
      const G = polar(rm, phiG, yG);
      kit.xf.push().translate(G[0], yG, G[2]).rotateY(phiG);
      const half = (rso - rsi) / 2;
      for (const s of [-1, 1]) {
        beam.box(0, 2.1, s * (half - 0.1), 0.5, 4.5, 0.5, { tile: 2.4, color: [0.95, 0.82, 0.74], faces: ['+x', '-x', '+z', '-z'] });
      }
      wood.box(0, 4.05, 0, 0.6, 0.55, 2 * half + 0.5, { tile: 2.4, color: [0.9, 0.78, 0.7], faces: ['+x', '-x', '+y', '-y', '+z', '-z'] });
      kit.xf.pop();
      kit.box(polar(rsi + 0.35, phiG)[0], polar(rsi + 0.35, phiG)[2], 0.3, 0.3, yG, yG + 4.5, { tag: 'gatepost', rot: phiG });
      kit.box(polar(rso - 0.35, phiG)[0], polar(rso - 0.35, phiG)[2], 0.3, 0.3, yG, yG + 4.5, { tag: 'gatepost', rot: phiG });
    }

    // ---- door + windows (on the tilted facets)
    facet(kit, N, 0, R(0.5) * APO, 0.5, TILT, () => doorUnit(kit, { w: 1.8, h: 3.2, base: 0.5 }));
    const win = (k, yy, o = {}) => facet(kit, N, k, R(yy) * APO, yy, TILT, () => windowUnit(kit, { w: 1.15, h: 1.15, ...o }));
    win(3, 2.6); win(9, 2.6, { flowers: false });
    win(4, 6.6); win(8, 6.6);
    win(2, 12.4); win(10, 12.4); win(6, 12.4);
    // small door onto the balcony from the stair arrival side (phi = 210deg -> facet 7)
    facet(kit, N, 7, R(9.0) * APO, 9.0, TILT, () => doorUnit(kit, { w: 1.6, h: 3.0, base: 0.4, step: false }));

    // ---- sail hub on the +Z face
    const yH = 12.4, zAx = R(yH) * APO;
    beam.box(0, yH, (zAx - 0.6 + 7.0) / 2, 0.8, 0.8, 7.0 - (zAx - 0.6), { tile: 2.4, color: [0.85, 0.72, 0.62], faces: ['+z', '-z', '+x', '-x', '+y', '-y'] });
    kit.xf.push().translate(0, yH, 6.9).rotateX(PI / 2);
    kit.b('metal_brass').cyl(1.05, 0.75, 1.0, 8, { tile: 1.6, smooth: false, caps: 'top', emissive: 0.3 });
    kit.xf.pop();
    // rest / bearing bracket under the axle
    beam.box(0, yH - 1.0, zAx + 0.7, 1.4, 0.35, 1.4, { tile: 2.4, color: [0.85, 0.72, 0.62], faces: ['+z', '-z', '+x', '-x', '+y', '-y'] });

    // ---- lights + emitters, colliders, shadow
    const wgl = polar(R(6.6) * APO + 0.9, 4 * TAU / N);
    kit.glow(wgl[0], 6.6, wgl[2], { color: [1, 0.72, 0.36], size: 3.4, pool: 0 });
    const dgl = polar(R(0.5) * APO + 1.4, 0);
    kit.glow(dgl[0], 2.6, dgl[2], { color: [1, 0.72, 0.36], size: 3.4, pool: 3.6 });
    kit.cyl(0, 0, 5.4, -1, 3.0, { tag: 'tower' });
    kit.cyl(0, 0, 5.05, 3.0, 6.0, { tag: 'tower' });
    kit.cyl(0, 0, 4.7, 6.0, 9.0, { tag: 'tower' });
    kit.cyl(0, 0, 4.4, 9.0, Ht + 0.3, { tag: 'tower' });
    kit.cyl(0, 0, 3.4, Ht + 0.3, Ht + 5.0, { tag: 'cap' });
    kit.caster(0, 0, 4.6, Ht + 5, 0.5);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// tower_observatory : dark rune tower, broad spiral stair, open lantern room with a pointed teal dome
// ---------------------------------------------------------------------------------------------------------------
const OBS = { yB: 1.2, yF: 25.2, R0: 6.5, R1: 5.9, rso: 10.6, phi0: 20, dph: 8.5, steps: 47, rise: 0.5 };
const obsR = (y) => OBS.R0 + (OBS.R1 - OBS.R0) * clamp((y - OBS.yB) / (OBS.yF - OBS.yB), 0, 1);
const obsCorb = (y) => (y < 22.8 ? 0 : y < 23.6 ? lerp(obsR(22.8), 6.6, (y - 22.8) / 0.8) : y < 24.4 ? lerp(6.6, 7.4, (y - 23.6) / 0.8) : y < 24.9 ? lerp(7.4, 8.2, (y - 24.4) / 0.5) : 8.2);

export function towerObservatory(kit, p) {
  const { x, z, rot = 0, scale = 1, y } = p;
  kit.at(x, z, { rot, scale, y }, () => {
    const { yB, yF, rso, steps, rise } = OBS;
    const N = 12, rr = -PI / N, APO = Math.cos(PI / N);
    const R = obsR;
    const dph = OBS.dph * DEG, phi0 = OBS.phi0 * DEG;
    const stone = kit.b('tower_stone'), br = kit.b('brick'), glowB = kit.b(null), rune = kit.b('rune_ring');
    const VIOLET = [0.66, 0.46, 1.0];
    const stoneCol = vgrad(0, [1.0, 1.0, 1.15], 40, [1.3, 1.3, 1.5]);

    // ---- base ring: three 0.4 tiers (walkable), flagstone tops
    const tiers = [[13.4, 0.4], [12.6, 0.8], [11.8, 1.2]];
    tiers.forEach(([r, h], i) => {
      cylBand(br, r, -0.9, h, 0, TAU, 16, { tile: 3.2, color: vgrad(-0.9, [0.6, 0.58, 0.68], h, [1.0, 0.96, 1.08]), emissive: 0.2 });
      const rin = i < 2 ? tiers[i + 1][0] : 0;
      if (rin) annulus(kit.b('flagstone'), rin - 0.05, r, h, 0, TAU, 16, { tile: 3.2, color: [1.02, 1.0, 1.1], emissive: 0.22 });
      else kit.b('flagstone').disc(r, 16, { y: h, tile: 3.2, color: [1.02, 1.0, 1.1], emissive: 0.22 });
      kit.cyl(0, 0, r, -1, h, { top: true, tag: 'ring' });
    });
    // ---- faceted shaft
    const ys0 = [yB - 0.6, 5.2, 9.2, 13.2, 17.2, 21.2, 22.8];
    stone.lathe(ys0.map((yy) => [R(yy), yy]), N, { tile: 3.2, uWrap: 13, smooth: false, rot: rr, emissive: 0.3, color: stoneCol });
    // corbel table under the lantern room (flares out to r 8.2)
    br.lathe([[R(22.8), 22.8], [6.6, 23.6], [7.4, 24.4], [8.2, 24.9], [8.2, 25.2]], N, { tile: 3.2, uWrap: 14, smooth: false, rot: rr, emissive: 0.24, color: [1.0, 0.96, 1.1] });
    // glowing bands round the shaft
    for (const yy of [9.6, 16.4]) cylBand(glowB, R(yy) + 0.05, yy, yy + 0.22, 0, TAU, N, { color: VIOLET, emissive: 1 });

    // ---- helical stair
    const stepTop = (k) => yB + rise * (k + 1);
    const phiC = (k) => phi0 + (k + 0.5) * dph;
    const rinVis = (yT) => Math.max(0.95 * R(yT), obsCorb(yT) + 0.2);
    const arcO = dph * rso * 1.04;
    const sColor = [1.02, 1.0, 1.12];
    for (let k = 0; k < steps; k++) {
      const yT = stepTop(k), ph = phiC(k);
      const rin = rinVis(yT);
      // visual slab (thick 1.4), colliders use the true wall radius
      const rc = (rin + rso) / 2, cx = Math.sin(ph) * rc, cz = Math.cos(ph) * rc;
      kit.xf.push().translate(cx, 0, cz).rotateY(ph);
      kit.b('flagstone').box(0, yT - 0.7, 0, arcO, 1.4, rso - rin, { tile: 3.2, color: sColor, emissive: 0.22, faces: ['+y'] });
      br.box(0, yT - 0.7, 0, arcO, 1.4, rso - rin, { tile: 3.2, color: vgrad(-2, [0.7, 0.68, 0.8], 30, [1.0, 0.98, 1.1]), emissive: 0.22, faces: ['+z', '-x'] });
      kit.xf.pop();
      const rinC = Math.max(R(yT) - 0.05, obsCorb(yT) + 0.1), rcC = (rinC + rso) / 2;
      kit.box(Math.sin(ph) * rcC, Math.cos(ph) * rcC, arcO / 2, (rso - rinC) / 2, yT - 1.4, yT, { top: true, rot: ph, tag: 'step' });
      // outer parapet
      kit.xf.push().translate(Math.sin(ph) * (rso - 0.25), 0, Math.cos(ph) * (rso - 0.25)).rotateY(ph);
      br.box(0, yT + 0.45, 0, arcO, 0.9, 0.5, { tile: 3.2, color: vgrad(-2, [0.75, 0.72, 0.85], 30, [1.08, 1.05, 1.15]), emissive: 0.22, faces: ['+y', '+z', '-z'] });
      kit.xf.pop();
      if (k % 2 === 1) {
        const yT0 = stepTop(k - 1), pr = Math.sin(ph), pc = Math.cos(ph);
        const mid = phi0 + k * dph;      // boundary between steps k-1 and k
        kit.box(Math.sin(mid) * (rso - 0.25), Math.cos(mid) * (rso - 0.25), arcO, 0.25, yT0, yT + 0.95, { rot: mid, tag: 'rail' });
      }
    }
    // stone piers under the stair
    for (let k = 5; k < 26; k += 6) {
      const yT = stepTop(k), ph = phiC(k), rp = rso - 0.75;
      kit.xf.push().translate(Math.sin(ph) * rp, 0, Math.cos(ph) * rp).rotateY(ph);
      br.box(0, (yT - 1.4 - 1.0) / 2, 0, 1.5, yT - 1.4 + 1.0, 1.5, { tile: 3.2, color: vgrad(-1, [0.62, 0.6, 0.72], 26, [1.0, 0.98, 1.1]), emissive: 0.2, faces: ['+z', '-z', '+x', '-x'] });
      kit.xf.pop();
    }
    // lanterns on the parapet
    for (let k = 3; k < steps; k += 8) {
      const yT = stepTop(k), ph = phiC(k), rl = rso - 0.25;
      const px = Math.sin(ph) * rl, pz = Math.cos(ph) * rl;
      br.box(px, yT + 0.9 + 0.3, pz, 0.5, 0.6, 0.5, { tile: 3.2, color: [1.0, 0.98, 1.1], emissive: 0.22, faces: ['+z', '-z', '+x', '-x', '+y'] });
      lanternBody(kit, px, yT + 1.5 + 0.36, pz, { s: 1.0 });
      kit.glow(px, yT + 1.9, pz, { color: [1, 0.72, 0.36], size: 3.6, pool: 3.2 });
    }
    // ---- rune plaques following the stair up the wall, windows, door
    const passY = (phiDeg) => {
      let a = phiDeg; if (a < OBS.phi0) a += 360;
      const k = Math.floor((a - OBS.phi0) / OBS.dph);
      return k < steps ? stepTop(k) : null;
    };
    for (let f = 0; f < N; f++) {
      const phiF = f * 30;
      const yP = passY(phiF);
      if (yP === null) continue;
      const yy = yP + 4.3;
      if (yy < 22.4 && f !== 0) {
        const s = 0.95, apo = R(yy) * APO + 0.06;
        facet(kit, N, f, apo, yy, 0, () => rune.quad([-s, -s, 0], [s, -s, 0], [s, s, 0], [-s, s, 0], { uv: [0, 0, 1, 1], emissive: 0.9, color: [0.95, 0.9, 1.0] }));
      }
    }
    // arched double-height door on the +Z facet, standing on the top tier
    facet(kit, N, 0, R(yB + 0.5) * APO, yB, 0, () => doorUnit(kit, { w: 2.4, h: 4.8, base: 0.0, step: false, trim: [0.9, 0.86, 1.0] }));
    // arrow-slit windows (lit)
    [[3, 4.5], [6, 8.0], [9, 5.2], [10, 14.5], [1, 10.0], [7, 16.0]].forEach(([f, yy0]) => {
      const yP = passY(f * 30);
      const yy = yP === null ? yy0 : yP + 2.4;
      if (yy > 23) return;
      facet(kit, N, f, R(yy) * APO, yy, 0, () => windowUnit(kit, { w: 0.95, h: 1.3, sill: true, header: true, trim: [0.85, 0.85, 1.0] }));
    });

    // ---- lantern room
    const pillarR = 7.3, nP = 8;
    const phiP = (j) => (37 + 45 * j) * DEG;
    const yFl = yF;
    kit.b('flagstone').disc(8.2, 16, { y: yFl, tile: 3.2, color: [1.02, 1.0, 1.1], emissive: 0.22 });
    // central plinth and rune plate
    kit.xf.push().translate(0, yFl, 0);
    br.cyl(2.35, 2.0, 1.0, 12, { tile: 3.0, smooth: false, caps: 'top', color: [1.0, 0.97, 1.1], emissive: 0.22 });
    kit.xf.pop();
    {
      const s = 3.6;
      rune.box(0, yFl + 0.05, 0, 2 * s, 0.1, 2 * s, { uv: [0, 0, 1, 1], emissive: 0.9, color: [0.95, 0.9, 1.0], faces: ['+y'] });
      br.box(0, yFl + 0.05, 0, 2 * s, 0.1, 2 * s, { tile: 3.2, color: [0.9, 0.88, 1.0], emissive: 0.2, faces: ['+z', '-z', '+x', '-x'] });
    }
    const yCap = 35.2, ySpr = 32.0;
    for (let j = 0; j < nP; j++) {
      const ph = phiP(j), px = Math.sin(ph) * pillarR, pz = Math.cos(ph) * pillarR;
      kit.xf.push().translate(px, 0, pz).rotateY(ph);
      br.box(0, yFl + 0.3, 0, 1.6, 0.6, 1.6, { tile: 3.2, color: [1.0, 0.97, 1.1], emissive: 0.22, faces: ['+z', '-z', '+x', '-x', '+y'] });
      stone.box(0, (yFl + 0.6 + yCap - 0.6) / 2, 0, 1.1, yCap - 0.6 - yFl - 0.6, 1.1, { tile: 3.2, color: [1.15, 1.15, 1.35], emissive: 0.3, faces: ['+z', '-z', '+x', '-x'] });
      br.box(0, yCap - 0.3, 0, 1.6, 0.6, 1.6, { tile: 3.2, color: [1.0, 0.97, 1.1], emissive: 0.22, faces: ['+z', '-z', '+x', '-x', '-y'] });
      rune.quad([-0.42, 28.4, 0.6], [0.42, 28.4, 0.6], [0.42, 29.24, 0.6], [-0.42, 29.24, 0.6], { uv: [0, 0, 1, 1], emissive: 0.9, color: [0.95, 0.9, 1.0] });
      kit.xf.pop();
      kit.cyl(px, pz, 0.75, yFl, yCap + 0.2, { tag: 'pillar' });
    }
    for (let j = 0; j < nP; j++) {
      const pm = phiP(j) + 22.5 * DEG, dc = pillarR * Math.cos(22.5 * DEG);
      const cx = Math.sin(pm) * dc, cz = Math.cos(pm) * dc;
      kit.xf.push().translate(cx, 0, cz).rotateY(pm);
      archUnit(kit, { a: 2.35, ys: ySpr, Yt: yCap, D: 0.45, n: 6, prud: 0.12, ringW: 0.6, tex: 'brick', tint: [1.0, 0.97, 1.1], emissive: 0.24, glow: true, tunnel: true, keystone: true, tile: 3.2, edges: false });
      if (j !== 0) {
        // low balustrade between the pillars (the span j=0 is the stair arrival)
        br.box(0, yFl + 0.6, 0, 4.9, 1.2, 0.7, { tile: 3.2, color: [1.0, 0.97, 1.1], emissive: 0.22, faces: ['+z', '-z', '+y'] });
      }
      kit.xf.pop();
      if (j !== 0) kit.box(cx, cz, 2.45, 0.38, yFl, yFl + 1.25, { rot: pm, tag: 'balustrade' });
    }
    // cornice + glowing ring + dome
    br.lathe([[7.3, yCap], [8.9, yCap], [8.9, yCap + 0.8], [8.6, yCap + 1.1]], 16, { tile: 3.2, uWrap: 17, smooth: false, emissive: 0.24, color: [1.05, 1.0, 1.15] });
    cylBand(glowB, 8.96, yCap + 0.3, yCap + 0.55, 0, TAU, 16, { color: VIOLET, emissive: 1 });
    const dome = [[8.6, yCap + 1.1], [8.9, yCap + 1.7], [8.3, yCap + 3.0], [7.0, yCap + 4.7], [5.2, yCap + 6.4], [3.2, yCap + 7.9], [1.4, yCap + 9.1], [0, yCap + 10.8]];
    kit.b('roof_teal').lathe(dome, 16, { tile: 3.0, uWrap: 17, smooth: false, emissive: 0.18, color: vgrad(yCap, [0.85, 0.85, 0.95], yCap + 10.8, [1.15, 1.15, 1.25]) });
    kit.xf.push().translate(0, yCap + 10.7, 0);
    kit.b('metal_brass').cyl(0.3, 0.0, 3.4, 6, { tile: 1.6, smooth: false, emissive: 0.3 });
    kit.xf.translate(0, 1.4, 0);
    kit.b('metal_brass').sphere(0.42, 6, 3, { tile: 1.6, smooth: false, emissive: 0.5 });
    kit.xf.pop();

    // ---- lights / colliders / shadow
    kit.glow(0, yFl + 5, 0, { color: [0.62, 0.45, 1.0], size: 12, pool: 0 });
    const dg = polar(R(yB) * APO + 1.6, 0);
    kit.glow(dg[0], yB + 3, dg[2], { color: [1, 0.72, 0.36], size: 4, pool: 4 });
    kit.cyl(0, 0, 6.2, -1, 8, { tag: 'tower' });
    kit.cyl(0, 0, 6.0, 8, 16, { tag: 'tower' });
    kit.cyl(0, 0, 5.75, 16, 24.6, { tag: 'tower' });
    kit.cyl(0, 0, 8.1, 24.6, yFl, { top: true, tag: 'floor' });
    kit.cyl(0, 0, 2.35, yFl, yFl + 1.0, { tag: 'plinth' });
    kit.cyl(0, 0, 7.6, yCap + 0.2, yCap + 4.8, { tag: 'dome' });
    kit.cyl(0, 0, 4.2, yCap + 4.8, yCap + 11, { tag: 'dome' });
    kit.caster(0, 0, 6.0, 44, 0.5);
  });
}

// stair geometry constants shared with the anchors below
const _phiG = (55 + 11 * 7.5) * DEG, _gate = polar(8.6, _phiG, 4.5);

export const TOWERS = {
  tower_observatory: {
    fn: towerObservatory, size: 30,
    note: 'Observatory: faceted 12-sided dark tower_stone shaft (r 6.5 at y=1.2 tapering to 5.9), 3-tier walkable base ring (r 13.4/12.6/11.8, tops y=0.4/0.8/1.2), corbel flaring to r 8.2, open-air lantern room: floor at y=25.2 (r 8.1, walkable, top:true), central plinth r 2.35 (top y=26.2) with a rune plate, 8 pillars at r 7.3 (to y=35.2) with arches + low balustrades, pointed teal dome (to y~46) and brass finial (~49). Broad stone spiral stair (outer r 10.6, inner edge = tower wall, 0.5 rise, 47 steps of 8.5deg) starts on the top ring tier (y=1.2) at phi=20deg and winds counter-clockwise (phi from +Z toward +X) ~1.1 turns to the floor at phi~59deg (the open arch span, no balustrade); steps are top:true boxes, parapet colliders on the outer edge, lanterns along the parapet, violet rune plaques spiralling up the wall + glowing bands. Door on +Z at the ring. anchors.beacon = [0,26.2,0] (top of the plinth; 9-unit lantern stands here, clear height to the dome ~10 above the plinth).',
    anchors: { beacon: [0, 26.2, 0] },
  },
  windmill_body: {
    fn: windmillBody, size: 22,
    note: 'Windmill tower: faceted 12-sided stone/plaster tower r 5.5 (base) -> 4.0 (y=15), wooden cone cap to y~22, door on +Z at the base. Sail axle/hub on the +Z face at y=12.4 (anchors.sails = hub front [0,12.4,8.0]; sail plane z~7.5, sails radius <= 8). C-shaped balcony ring at y=9.0 (r 4.3..7.2, walkable, railing, open toward +Z so the sails clear it). Exterior wooden stair r 7.4..9.8 climbs counter-clockwise (phi from +Z toward +X) from the ground at phi=55deg (front-right) to the balcony at phi~205deg; 0.5 rise per step, landing slab at y=4.5 ending in a timber gate frame: anchors.gate = [x,4.5,z,rotY] centre of the stair at the frame, gate local +Z = climbing direction, opening ~2.25 wide x 3.6 tall. anchors.beacon = [0,9.5,-5.75] on a stone pad on the balcony (4-unit lantern stands there). anchors.door in front of the base door.',
    anchors: { sails: [0, 12.4, 8.0], gate: [+_gate[0].toFixed(2), 4.5, +_gate[2].toFixed(2), +(_phiG + PI / 2).toFixed(3)], beacon: [0, 9.5, -5.75], door: [0, 0, 7.2] },
  },
};
