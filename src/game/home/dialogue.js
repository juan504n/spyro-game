// What the Elder says in Dawnhaven: he follows the hero's progress (progress.js): the realms restored, the secrets found.
import { realmsDone } from '../progress.js';
import { DOORS, SECRETS } from './level.js';

const HINTS = {
  pond: 'THERE IS TREASURE ON THE ISLET IN MIRROR LAKE. STEPPING STONES LEAD OUT TO IT FROM THE LONG PIER.',
  garden: 'A HIDDEN GARDEN LIES OFF THE TERRACES, BEHIND A CRACKED WALL. TRY A GOOD CHARGE!',
  mill: 'CLIMB THE WINDMILL AT THE TOP OF THE TERRACES. THE KEEPERS LEFT A CHEST ON ITS LOOKOUT.',
  vault: 'THE NORTH WALL OF THE ECHO HALL, UNDER THE CRAG, HIDES A CRYSTAL VAULT. A CRACKED WALL SHUTS THE WAY.',
  summit: 'THE STONE ROAD ON THE CRAG\'S WEST SIDE WINDS UP TO ITS SUMMIT. A CHEST WAITS BESIDE THE SKYWEAVER DOOR.',
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
    pages.push('IT IS A WIDE COUNTRY. THE ROAD NORTH CROSSES THE HEARTLANDS TO THE CRAG. WEST, THE TERRACES CLIMB TO THE WINDMILL. EAST LIES MIRROR LAKE, AND BEYOND IT THE EMBER CANYON.');
    pages.push(`EVERY DOOR STANDS SOMEWHERE OF ITS OWN: ONE HERE IN THE COVE, ONE UNDER THE CRAG, ONE ON ITS SUMMIT, ONE AT THE END OF THE PIER AND ONE IN THE FORGE. ${sleeping.length} STILL SLEEP: ${listOf(sleeping)}.`);
    pages.push('THE GUARDIAN\'S GATE, FAR TO THE NORTH, WILL OPEN WHEN THE LANTERNS OF EVERY REALM BURN. UNTIL THEN, EXPLORE!');
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
