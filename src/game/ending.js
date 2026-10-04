// The ending: what the Guardian says when the last lantern of his crown is lit, the credits that follow (the game's own story in a few lines, and what it is made of), and the shot of the court while
// he speaks (the camera stands low in front of the dais, circles to the side and rises as the three columns of light climb from the crown). App.startEnding plays them in that order.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/** the Guardian's words, a page at a time (the dialogue box holds about four lines of a page) */
export const SPEECH = [
  'YOU CAME THROUGH THE GATE WITH THE LIGHT OF EVERY REALM, LITTLE FLAME. I FELT EACH ONE BURN.',
  'THE GLOOM TOOK MY LANTERNS AND THEN MY SENSES. I STRUCK AT EVERYTHING THAT CAME NEAR. FORGIVE ME.',
  'THE KEEPERS SET ME HERE TO GUARD THE DAWN. NOW MY CROWN BURNS AGAIN, AND THE DAWN IS SAFE.',
  'GO HOME, SPYRO. THE SUN WILL RISE ON EVERY REALM. AND IF THE GLOOM EVER RETURNS, THE LANTERNS WILL KNOW WHO TO CALL.',
];

/**
 * The credits, as lines to scroll: { text, kind } with kind 'title' (big, gold), 'head' (gold), 'text' (white) or 'gap'. `done` is the realms the hero has restored (progress.realms), so that
 * every place he has saved is named in the order of the doors.
 */
export function creditsLines(places) {
  const L = [];
  const add = (text, kind = 'text') => L.push({ text, kind });
  add('THE LANTERN KEEPERS', 'title');
  add('A STORY IN SIX PLACES', 'head');
  add('', 'gap');
  add('THE SNUFFERS PUT OUT THE LANTERNS');
  add('AND THE SUN COULD NOT RISE.');
  add('', 'gap');
  for (const p of places) add(p, 'head');
  add('', 'gap');
  add('SPYRO RELIT THEM ALL,');
  add('AND IN THE END, THE WARDEN\'S CROWN.');
  add('', 'gap');
  add('MADE OF CODE', 'title');
  add('EVERY TEXTURE IS PAINTED BY A FUNCTION.');
  add('EVERY MODEL IS BUILT FROM PRIMITIVES.');
  add('EVERY SOUND AND EVERY SONG IS SYNTHESISED.');
  add('NOTHING WAS RIPPED. NOTHING WAS RECORDED.');
  add('', 'gap');
  add('THE DAWN', 'title');
  add('THE LANTERNS BURN. THE DOORS SHINE GOLD.');
  add('THE GUARDIAN KEEPS HIS COURT, AND HIS CROWN IS ALIGHT.');
  add('', 'gap');
  add('THANK YOU FOR PLAYING', 'title');
  return L;
}

/** how many pixels a credits line takes (a gap is half a line) */
export const lineHeight = (l) => (l.kind === 'gap' ? 8 : l.kind === 'title' ? 20 : 13);

/**
 * The shot of the court while the Guardian speaks: low in front of the dais at first, looking up at him, then round to his side and up, over twelve seconds (`t` is the time since the shot began, which
 * is held after that). `boss` is the Court's record in the gameplay data (gameplay.boss: x, z, daisY).
 */
export function endingShot(boss) {
  const cx = boss.x, cz = boss.z, y0 = boss.daisY;
  return (t) => {
    const e = ease(clamp(t / 13, 0, 1));
    const a = lerp(0.12, -0.8, e), r = lerp(23, 31, e), h = lerp(3.5, 17, e);
    return { pos: [cx + Math.sin(a) * r, y0 + h, cz + Math.cos(a) * r], look: [cx, y0 + lerp(10, 23, e), cz], fov: lerp(56, 64, e) };
  };
}
