// How a person plays each foe, as data (tools/foe-test.mjs plays these against the brains and a model of the hero; tools/foe-bot.mjs plays the same ones in the running game with the real
// controller): a policy is a function of what the hero can see and says what he does, { dx, dz, mag, jump, flame, charge }; a play is a foe, a policy, how long, where the hero stands (a metre
// count from the foe, on the line through them) and what must come of it.
//   s = { t, hero: { x, y, z, yaw, grounded, up (metres over the floor) }, foe: the foe's record (state, x, z, yaw, locked, aimX, aimZ, ...), foes: [every foe] }
const hyp = Math.hypot;
export const dirTo = (a, b) => { const d = hyp(b.x - a.x, b.z - a.z) || 1; return [(b.x - a.x) / d, (b.z - a.z) / d]; };
export const dist = (a, b) => hyp(b.x - a.x, b.z - a.z);

export const still = () => ({ dx: 0, dz: 0, mag: 0 });
/** run at the foe, and ram when `ram` m from it (or flame when `flame` m): what a hero does to a foe that keeps away or comes */
export const rush = ({ ram = 0, flame = 0 } = {}) => (s) => {
  const [dx, dz] = dirTo(s.hero, s.foe), d = dist(s.hero, s.foe);
  return { dx, dz, mag: 1, charge: ram > 0 && d < ram, flame: flame > 0 && d < flame && d > 1 };
};
/** run in circles (a hero who keeps moving) */
export const lap = (s) => ({ dx: Math.cos(s.t * 1.2), dz: Math.sin(s.t * 1.2), mag: 1 });
export const lapSlow = (s) => ({ dx: Math.cos(s.t * 1.1), dz: Math.sin(s.t * 1.1), mag: 1 });
/** run at the foe and ram it head on from 8 m, whatever it is doing */
export const headOn = (s) => { const [dx, dz] = dirTo(s.hero, s.foe); return { dx, dz, mag: 1, charge: dist(s.hero, s.foe) < 8 }; };

/** do nothing for `wait` seconds, then play `then` */
export const after = (wait, then) => (s) => (s.t < wait ? still(s) : then(s));

/** the Ramhog: step off the line it runs, and go after it: from behind its brow is nothing (and a hog that has hit a wall falls to anything: he goes at it from where he is) */
export const hogPlay = (s) => {
  const e = s.foe, h = s.hero, fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
  const lat = (h.x - e.x) * fz - (h.z - e.z) * fx, lon = (h.x - e.x) * fx + (h.z - e.z) * fz;       // where the hero is in the hog's own frame: lon > 0 is in front of it
  if ((e.state === 'paw' && e.st >= 0.65) || (e.state === 'rush' && lon > 0.5)) {                       // (0.65 s into the paw: 0.25 s before it ends, when its line is fixed)
    if (Math.abs(lat) < 2.6) { const sd = lat >= 0 ? 1 : -1; return { dx: fz * sd, dz: -fx * sd, mag: 1 }; }               // (step off its line)
    return { dx: 0, dz: 0, mag: 0 };
  }
  if (e.state === 'stunned' || (['rush', 'skid', 'turn'].includes(e.state) && lon <= 0.5)) { const [dx, dz] = dirTo(h, e); return { dx, dz, mag: 1, charge: dist(h, e) < 6 }; }   // (it has gone by, or hit a wall: after it, and a ram when he is near enough that it lasts to the hog)
  return { dx: 0, dz: 0, mag: 0 };
};

/** the Slinger's ball: stand where you are and jump when the ring turns hot (the ball lands 0.5 s later: a hero 1.6 m up is over the burst) */
export const jumpSplash = (s) => (s.foe.balls.some((b) => b.locked) && s.hero.grounded ? { dx: 0, dz: 0, mag: 0, jump: true } : still(s));
/** the Dustmole's burst: jump 0.45 s before it (the ground has cracked for 0.35 s: he is 2.8 m up when it comes) */
export const jumpBurst = (s) => (s.foe.state === 'crack' && s.foe.st >= 0.35 && s.hero.grounded ? { dx: 0, dz: 0, mag: 0, jump: true } : still(s));

/** the Dustmole: let it come, leave the ring when the ground cracks, strike it dazed */
export const molePlay = (s) => {
  const e = s.foe, h = s.hero;
  if (e.state === 'dazed') { const [dx, dz] = dirTo(h, e); return { dx, dz, mag: 1, charge: dist(h, e) < 6 }; }
  if (e.state === 'crack') { const [dx, dz] = dirTo(e, h); return { dx, dz, mag: 1 }; }                    // (out of the ring)
  return { dx: 0, dz: 0, mag: 0 };
};

/** the Lidwarden: go round it (it turns at 1.3 rad/s; he circles at three times that) and strike its side */
export const wardPlay = (s) => {
  const e = s.foe, h = s.hero, d = dist(h, e);
  const rel = Math.atan2(h.x - e.x, h.z - e.z);
  const off = Math.abs(((rel - e.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);                              // how far round from its front he is: 0 dead ahead of it, PI behind it
  if (d > 7) { const [dx, dz] = dirTo(h, e); return { dx, dz, mag: 1 }; }
  if (off < 1.5) { const a = rel + 1.5; return { dx: Math.sin(a) - Math.sin(rel) * (d - 3.2) * 0.3, dz: Math.cos(a) - Math.cos(rel) * (d - 3.2) * 0.3, mag: 1 }; }       // (round it, at about 3 m)
  const [dx, dz] = dirTo(h, e);
  return { dx, dz, mag: 1, charge: d < 5.5 };
};
/** ... or step aside from the bash and strike while the shield is down */
export const wardOpen = (s) => {
  const e = s.foe;
  if (e.state === 'open') { const [dx, dz] = dirTo(s.hero, e); return { dx, dz, mag: 1, charge: true }; }
  if (e.state === 'raise') { const [dx, dz] = dirTo(e, s.hero); return { dx: dz, dz: -dx, mag: 1 }; }       // (a step to the side of the bash)
  return { dx: 0, dz: 0, mag: 0 };
};

/** the Rimeling: hold the ground and breathe on it as it comes (its shell takes about 0.9 s of fire: it has not swung by then); a hero who walks into it while he breathes is struck: that is `rush({ flame })` */
export const holdFlame = (s) => {
  const [dx, dz] = dirTo(s.hero, s.foe), d = dist(s.hero, s.foe);
  if (d > 6.2) return { dx, dz, mag: 1 };
  return { dx, dz, mag: 0.01, flame: d > 1 };
};

/** ... and when its shell is down, run in circles for the ice to grow back (the policy remembers on the foe's own record that it has seen the shell fall) */
export const meltAndRun = (s) => {
  const e = s.foe;
  if (e.shell === 0) e.shellDown = true;
  return e.shellDown ? lap(s) : holdFlame(s);
};

/** the Fusepup: flame it from afar (out of the blast) ... */
export const pupFlame = (s) => {
  const d = dist(s.hero, s.foe), [dx, dz] = dirTo(s.hero, s.foe);
  if (s.foe.state === 'idle') return { dx: 0, dz: 0, mag: 0 };
  if (d > 6.0) return { dx, dz, mag: 0 };
  if (d >= 4.4) return { dx, dz, mag: 0, flame: true };
  return { dx: -dx, dz: -dz, mag: 1 };                                                                      // (too near: back away)
};
/** ... or run from it */
export const pupRun = (s) => { const [dx, dz] = dirTo(s.foe, s.hero); return { dx, dz, mag: 1 }; };

/** the Dusk Moth: jump and breathe fire; ram it when it has landed */
export const mothPlay = (s) => {
  const e = s.foe, h = s.hero, [dx, dz] = dirTo(h, e), d = dist(h, e);
  if (e.state === 'idle' || e.state === 'alert') return { dx: 0, dz: 0, mag: 0 };
  if (e.state === 'land') return { dx, dz, mag: 1, charge: d < 6 };
  if (d < 8.5 && h.grounded && e.state === 'circle') return { dx, dz, mag: 0.01, jump: true };
  if (!h.grounded && h.up > 0.7) return { dx, dz, mag: 0.01, flame: d < 7.4 };                              // (h.up: how high over the floor)
  return { dx: 0, dz: 0, mag: 0 };
};
/** fire breathed from the ground, at a moth that hangs */
export const mothGround = (s) => { const [dx, dz] = dirTo(s.hero, s.foe); return { dx, dz, mag: 0.01, flame: dist(s.hero, s.foe) < 7 }; };
/** step away from where its shadow falls */
export const mothDodge = (s) => {
  const e = s.foe;
  if (e.state === 'rear' || e.state === 'dive') { const a = Math.atan2(s.hero.x - e.aimX, s.hero.z - e.aimZ); return { dx: Math.sin(a), dz: Math.cos(a), mag: 1 }; }
  return { dx: 0, dz: 0, mag: 0 };
};

/**
 * Each play: id, what it says, the foe, the policy, T (seconds), `at` (how far from the foe the hero begins, on the line through them), and what must come of it (`want`, judged by `judge`; `tol`: how many
 * of the runs may fail it, a policy is not a person; `seeds`: which runs; `others`: Snuffers of the old kinds that stand by it, [{ kind, dx, dz }] from the foe; `posts`: posts that stand in the way,
 * [{ along (metres from the foe towards the hero), across, r }]; `hears`: the sounds the game must ask for in the play and `shows`: the foe must draw what warns the hero (a ring, a crack, a lane, a glow)
 * at some time in it (both are for tools/foe-bot.mjs, the running game); `sim: false`: only the running game has what it needs: the old Snuffers are not a brain's to play):
 *   clear       the foe falls and the hero is never hurt           win      the foe falls (the hero may be hurt once)         hurt   the hero is hurt at least once
 *   unhurt      the hero is never hurt                              nokill   the foe does not fall                            nofront  nothing kills it from the front (and something rang off it)
 *   quiet       never hurt and never killed                        boomed   it went off and the hero was not hurt            blast    the hero is hurt and the keg went off
 *   ringed      it is not killed and something rang off it         chain    it fell and so did every Snuffer that stood by it
 *   stunkill    it hit a post and fell to a blow from the front    melted   its shell took three ticks of fire, it fell, and he was never hurt
 *   regrown     its shell fell, grew back, and he was never hurt    smoked   it fell, what it had called was dismissed, he was hurt at most twice
 *   dodged:E    he was never hurt and the foe said E (splat, burst) at least twice: it attacked, and what it did was avoided
 * (and a ram that rings off throws the hero back and ends his charge, wherever a play says something rang off)
 */
export const PLAYS = [
  { id: 'slinger-ram', say: 'Slinger: a hero who runs at it and rams it is never hit and wins', kind: 'slinger', policy: rush({ ram: 7 }), T: 25, at: 14, want: 'clear' },
  { id: 'slinger-flame', say: 'Slinger: so does one who flames it from 5.5 m', kind: 'slinger', policy: rush({ flame: 5.5 }), T: 25, at: 14, want: 'clear' },
  { id: 'slinger-still', say: 'Slinger: a hero who stands still is hit (by the ball that comes down where he stands)', kind: 'slinger', policy: still, T: 12, at: 14, want: 'hurt', hears: ['foe_wind', 'foe_lob', 'foe_splat'], shows: true },
  { id: 'slinger-jump', say: 'Slinger: a hero who stands still and jumps when the ring turns hot is over the burst and is never hit (a ball lands at least twice)', kind: 'slinger', policy: jumpSplash, T: 12, at: 14, want: 'dodged:splat', hears: ['foe_wind', 'foe_lob', 'foe_splat'] },
  { id: 'slinger-move', say: 'Slinger: a hero who keeps moving is not hit by what it throws (the ring stops following him)', kind: 'slinger', policy: lap, T: 14, at: 9, want: 'unhurt', hears: ['foe_wind', 'foe_lob', 'foe_splat'] },
  { id: 'hog-flank', say: 'Ramhog: a hero who steps off its line and goes after it wins, and is not hurt', kind: 'hog', policy: hogPlay, T: 30, at: 14, want: 'clear', hears: ['foe_paw', 'foe_rush'] },
  { id: 'hog-post', say: 'Ramhog: a hog that runs into a post is stunned, and a stunned hog falls to anything, its brow too', kind: 'hog', policy: hogPlay, T: 30, at: 14, posts: [{ along: 11, across: 0, r: 0.6 }], want: 'stunkill', hears: ['foe_paw', 'foe_rush', 'foe_bonk'] },
  { id: 'hog-headon', say: 'Ramhog: a hero who rams at it head on gets nothing from its brow', kind: 'hog', policy: headOn, T: 20, at: 14, want: 'nofront', hears: ['foe_paw', 'foe_rush', 'armor_clang'] },
  { id: 'hog-still', say: 'Ramhog: a hero who stands still is run down', kind: 'hog', policy: still, T: 12, at: 14, want: 'hurt', hears: ['foe_paw', 'foe_rush'], shows: true },
  { id: 'mole-bait', say: 'Dustmole: a hero who waits for it, leaves the ring when the ground cracks and strikes it dazed wins, and is not hurt', kind: 'mole', policy: molePlay, T: 30, at: 14, want: 'clear', hears: ['foe_rumble', 'foe_crack', 'foe_burst'] },
  { id: 'mole-still', say: 'Dustmole: a hero who stands still in the ring is caught by the burst', kind: 'mole', policy: still, T: 12, at: 14, want: 'hurt', hears: ['foe_rumble', 'foe_crack', 'foe_burst'], shows: true },
  { id: 'mole-jump', say: 'Dustmole: a hero who jumps as the ground is about to burst is over it and is never hurt (it bursts at least twice)', kind: 'mole', policy: jumpBurst, T: 14, at: 14, want: 'dodged:burst', hears: ['foe_crack', 'foe_burst'] },
  { id: 'mole-move', say: 'Dustmole: a hero who only keeps moving is never hurt (it cannot catch a run) and never wins either', kind: 'mole', policy: lapSlow, T: 20, at: 9, want: 'quiet', hears: ['foe_rumble'] },
  { id: 'warden-circle', say: 'Lidwarden: a hero who goes round it and strikes its side or its back wins', kind: 'warden', policy: wardPlay, T: 30, at: 14, want: 'win', tol: 1 },
  { id: 'warden-headon', say: 'Lidwarden: a hero who rams it head on gets nothing from the front while its shield is up', kind: 'warden', policy: headOn, T: 20, at: 14, want: 'nofront', hears: ['foe_raise', 'foe_bash', 'armor_clang'] },
  { id: 'warden-still', say: 'Lidwarden: a hero who stands still is bashed', kind: 'warden', policy: still, T: 12, at: 14, want: 'hurt', hears: ['foe_raise', 'foe_bash'] },
  { id: 'warden-open', say: 'Lidwarden: a hero who steps aside from the bash and strikes it while the shield is down wins too', kind: 'warden', policy: wardOpen, T: 12, at: 9, want: 'win1', seeds: [3], hears: ['foe_raise', 'foe_bash'] },
  { id: 'pup-flame', say: 'Fusepup: a hero who flames it from more than 4 m is not in the blast, and wins', kind: 'pup', policy: pupFlame, T: 14, at: 13, want: 'clear', hears: ['foe_fuse', 'foe_boom'], shows: true },
  { id: 'pup-ram', say: 'Fusepup: a hero who rams it is in the blast of the keg it sets off', kind: 'pup', policy: rush({ ram: 4 }), T: 14, at: 14, want: 'blast', hears: ['foe_fuse', 'foe_boom'] },
  { id: 'pup-run', say: 'Fusepup: a hero who runs from it is not hurt (a run is quicker, and the fuse burns out behind him)', kind: 'pup', policy: pupRun, T: 8, at: 9, want: 'boomed', hears: ['foe_fuse', 'foe_boom'] },
  { id: 'moth-jump', say: 'Dusk Moth: a hero who jumps and breathes fire, and rams it when it lands, wins', kind: 'moth', policy: mothPlay, T: 30, at: 9, want: 'win', tol: 1 },
  { id: 'moth-still', say: 'Dusk Moth: a hero who stands still is dived on', kind: 'moth', policy: still, T: 12, at: 14, want: 'hurt', hears: ['foe_screech', 'foe_dive', 'foe_flap'], shows: true },
  { id: 'moth-ground', say: 'Dusk Moth: fire breathed from the ground does not reach it while it hangs (nothing is killed in the 2.4 s before its first dive)', kind: 'moth', policy: mothGround, T: 2.4, at: 9, want: 'nokill' },
  { id: 'moth-dodge', say: 'Dusk Moth: a hero who steps away from where its shadow falls is not hurt by its dives', kind: 'moth', policy: mothDodge, T: 14, at: 9, want: 'unhurt', hears: ['foe_screech', 'foe_dive', 'foe_flap'] },
  { id: 'caller-rush', say: 'Smokecaller: a hero who rushes it wins (it is slower than a run), hurt at most twice by what it called', kind: 'caller', policy: rush({ ram: 6 }), T: 30, at: 12, want: 'win2' },
  { id: 'caller-still', say: 'Smokecaller: it never fights itself: a hero who stands still is hurt by the Snuffers it called', kind: 'caller', policy: still, T: 14, at: 12, want: 'hurt', hears: ['foe_call', 'foe_puff'] },
  { id: 'caller-wait', say: 'Smokecaller: a hero who waits for a Snuffer to be called and then goes for the caller wins, and what it called goes up in smoke with it', kind: 'caller', policy: after(4.5, rush({ ram: 6 })), T: 30, at: 12, want: 'smoked', hears: ['foe_call', 'foe_puff'], shows: true },
  { id: 'pup-chain', say: 'Fusepup: the keg takes the Snuffers that stand by it (a Snuffer 2 m from it falls with it)', kind: 'pup', policy: pupFlame, T: 14, at: 13, others: [{ kind: 'basic', dx: 1.8, dz: 1.2 }], want: 'chain', hears: ['foe_fuse', 'foe_boom'], sim: false },
  { id: 'rime-flame', say: 'Rimeling: a hero who holds his ground and breathes on it (its shell takes three ticks of fire to melt, more than one breath) wins before it has swung, and is not hurt', kind: 'rime', policy: holdFlame, T: 15, at: 12, want: 'melted', hears: ['foe_ice'], sim: false },
  { id: 'rime-regrow', say: 'Rimeling: its ice grows back (5 s after the last breath): a hero who melts it and then runs finds it armoured again, and is not hurt', kind: 'rime', policy: meltAndRun, T: 9, at: 12, want: 'regrown', hears: ['foe_ice'], sim: false },
  { id: 'rime-rush', say: 'Rimeling: a hero who runs into it breathing is struck (its shell keeps it on its feet for the 0.9 s of fire it takes, and it swings in 0.66 s)', kind: 'rime', policy: rush({ flame: 5 }), T: 15, at: 12, want: 'hurt', hears: ['foe_ice', 'snuffer_swing'], sim: false },
  { id: 'rime-ram', say: 'Rimeling: a hero who rams it only slides it on its ice: it is never killed and its shell holds', kind: 'rime', policy: headOn, T: 10, at: 12, want: 'ringed', hears: ['armor_clang'], sim: false },
  { id: 'thief-flame', say: 'Pilferling: a hero who runs it down and flames it from 6 m catches it, and it never hurts him', kind: 'thief', policy: rush({ flame: 6 }), T: 25, at: 10, want: 'clear' },
  { id: 'thief-ram', say: 'Pilferling: a hero who rams after it catches it in the end (it sidesteps a ram that comes straight at it), and it never hurts him', kind: 'thief', policy: rush({ ram: 9 }), T: 30, at: 10, want: 'clear', tol: 1 },
  { id: 'thief-still', say: 'Pilferling: it does not fight: a hero who stands still is never touched', kind: 'thief', policy: still, T: 12, at: 14, want: 'quiet', hears: ['foe_jeer'] },
];

/**
 * Judge a play's outcome: { killed (the foe fell), hurts (times the hero was hurt), blows ([{ attack, out, side, state }]: what the hero's attacks did to it), boomed, left (foes still standing but it, at
 * the end), others (the `others` still standing) } -> null if it is what the play wants, else why not.
 */
export function judge(want, r) {
  const [word, arg] = want.split(':');
  const said = (r.said && r.said[arg]) || 0;
  const frontKills = r.blows.filter((b) => b.out === 'kill' && b.side === 'front' && b.state !== 'stunned' && b.state !== 'open');
  const rang = r.blows.some((b) => b.out === 'ring');
  const melts = r.blows.filter((b) => b.out === 'melt').length;
  const rams = r.blows.filter((b) => b.attack === 'ram' && b.out === 'ring' && b.after);                          // (only the running game says what became of the hero)
  const thrown = rams.every((b) => !b.after.charging && b.after.back);
  switch (word) {
    case 'dodged': return r.hurts === 0 && said >= 2 ? null : `hurts ${r.hurts}, ${arg} ${said} times`;
    case 'clear': return r.killed && r.hurts === 0 ? null : `killed ${r.killed}, hurts ${r.hurts}`;
    case 'win': return r.killed && r.hurts <= 1 ? null : `killed ${r.killed}, hurts ${r.hurts}`;
    case 'win1': return r.killed ? null : `killed ${r.killed}, hurts ${r.hurts}`;
    case 'win2': return r.killed && r.hurts <= 2 && !r.left ? null : `killed ${r.killed}, hurts ${r.hurts}, ${r.left} left standing`;      // (what it called goes up in smoke with it)
    case 'hurt': return r.hurts >= 1 ? null : 'never hurt';
    case 'unhurt': return r.hurts === 0 ? null : `hurts ${r.hurts}`;
    case 'nokill': return !r.killed ? null : 'it was killed';
    case 'quiet': return !r.killed && r.hurts === 0 ? null : `killed ${r.killed}, hurts ${r.hurts}`;
    case 'nofront': return frontKills.length === 0 && rang && thrown ? null : `${frontKills.length} kills from the front, rang off: ${rang}, hero thrown back: ${thrown}`;
    case 'ringed': return !r.killed && rang && thrown ? null : `killed ${r.killed}, rang off: ${rang}, hero thrown back: ${thrown}`;
    case 'chain': return r.killed && r.others === 0 ? null : `killed ${r.killed}, ${r.others} of the Snuffers by it left standing`;
    case 'boomed': return r.boomed && r.hurts === 0 && !r.killed ? null : `boomed ${r.boomed}, hurts ${r.hurts}, beaten ${r.killed} (a keg that goes off by itself is not beaten)`;
    case 'stunkill': return r.killed && r.hurts === 0 && r.blows.some((b) => b.out === 'kill' && b.state === 'stunned' && b.side === 'front') ? null : `killed ${r.killed}, hurts ${r.hurts}, no kill of a stunned hog from the front`;
    case 'melted': return r.killed && r.hurts === 0 && melts >= 3 ? null : `killed ${r.killed}, hurts ${r.hurts}, ${melts} ticks of fire on the shell`;
    case 'regrown': return !r.killed && r.hurts === 0 && r.shell === 1 && melts >= 3 ? null : `killed ${r.killed}, hurts ${r.hurts}, shell ${r.shell} after ${melts} ticks of fire`;
    case 'smoked': return r.killed && r.hurts <= 2 && !r.left && r.dismissed >= 1 ? null : `killed ${r.killed}, hurts ${r.hurts}, ${r.left} left standing, ${r.dismissed} dismissed`;
    case 'blast': return r.boomed && r.hurts >= 1 ? null : `boomed ${r.boomed}, hurts ${r.hurts}`;
    default: return 'unknown want ' + want;
  }
}
