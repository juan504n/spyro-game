// What the Elder says in Dawnhaven: he follows the hero's progress (progress.js): the realms restored, the secrets found.
import { realmsDone } from '../progress.js';
import { DOORS, SECRETS } from './level.js';

const HINTS = {
  pond: 'I HEAR THERE IS TREASURE ON THE ISLET IN DAWN POND. THE STEPPING STONES START AT THE SOUTH SHORE.',
  garden: 'A HIDDEN GARDEN LIES BEHIND THE COTTAGES, SOUTH-EAST OF THE PLAZA. A CRACKED WALL GUARDS IT. TRY A GOOD CHARGE!',
  mill: 'CLIMB THE WINDMILL ON THE EASTERN HILL. THE KEEPERS LEFT A CHEST AT THE TOP OF ITS STAIR.',
};

/** the names of the doors that still sleep, as a list in words: "A, B, C AND D" */
const listOf = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} AND ${names[names.length - 1]}`);

export function homeLines(game, npc) {
  const pr = game.progress;
  const done = pr ? realmsDone(pr) : 0;
  const sleeping = DOORS.filter((d) => !d.target).map((d) => d.name);
  const found = pr ? pr.home.secrets.filter((s) => SECRETS.some((k) => k.id === s)) : [];
  const left = SECRETS.filter((s) => !found.includes(s.id));
  const again = (npc.talks = (npc.talks || 0) + 1) > 1;
  const pages = [];
  if (!again) {
    pages.push(done > 0
      ? 'WELCOME TO DAWNHAVEN, SPYRO! GLOAMING VALE BURNS BRIGHT AGAIN, AND ITS DOOR SHINES GOLD. WELL DONE!'
      : 'WELCOME TO DAWNHAVEN, SPYRO! THIS IS THE HOMEWORLD OF THE LANTERN KEEPERS.');
    pages.push(`EVERY DOOR ON THE PLAZA OPENS ONTO A REALM. ${sleeping.length} STILL SLEEP: ${listOf(sleeping)}.`);
    pages.push('THE GUARDIAN\'S GATE IN THE NORTH WILL OPEN WHEN THE LANTERNS OF EVERY REALM BURN. UNTIL THEN, EXPLORE!');
  } else {
    pages.push(done > 0 ? `${done} OF ${DOORS.length} REALMS ARE RESTORED. THE GUARDIAN'S GATE STAYS SEALED UNTIL ALL ${DOORS.length} BURN.` : 'LIGHT THE LANTERNS OF A REALM AND ITS DOOR WILL SHINE FOR GOOD.');
  }
  if (left.length) {
    pages.push(HINTS[left[(npc.talks - 1) % left.length].id]);
    pages.push(`YOU HAVE FOUND ${found.length} OF ${SECRETS.length} SECRETS OF DAWNHAVEN.`);
  } else {
    pages.push(`YOU HAVE FOUND ALL ${SECRETS.length} SECRETS OF DAWNHAVEN. NOTHING ESCAPES YOU, SPYRO!`);
  }
  return pages;
}
