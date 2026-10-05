// The trials: what each kind of ask is, as a table. A trial stands in front of a lantern (`goal.trial` of a realm's brief, tools/lib/realm-rules.mjs `trials.*`) and seals it: flame does nothing to
// the lantern until the trial is solved, and the last step of the trial breaks the seal and lights it with all the ceremony of a lantern lit by fire. The design is in docs/DESIGN.md (round 29).
//
//   verbs    what the hero does in it (flame as an aim, ram as an aim, ram as a turn, run, jump, fight, chase)
//   hint     what the HUD says the first time he is near one (the kind's lesson, once)
//   fails    how it can be failed (and that failing costs a try and not a life)
//   reads    what shows the state (the lit bell, a plate's light, the clock...)
//   clock    it runs against a clock (the layout sets the time from the length of the way)
//   foes     it uses foes of the EnemySystem (spawn / fate)
export const TRIALS = {
  bells: { name: 'THE BELLS', verbs: ['flame', 'memory'], hint: 'THE BELLS RING A TUNE: BREATHE FIRE ON THEM IN THE SAME ORDER', fails: 'a wrong bell: the tune is rung again', reads: 'the bell that is lit, a count of the right ones' },
  plates: { name: 'THE PLATES', verbs: ['walk', 'jump', 'puzzle'], hint: 'A PLATE TURNS OVER AND THE TWO BESIDE IT: LIGHT THEM ALL', fails: 'none: step again', reads: 'each plate\'s light' },
  circuit: { name: 'THE CIRCUIT', verbs: ['run', 'jump'], hint: 'TOUCH THE PYLONS IN ORDER BEFORE THE CLOCK RUNS OUT', fails: 'the clock runs out: begin again', reads: 'the next pylon, the clock', clock: true },
  wisps: { name: 'THE WISPS', verbs: ['flame'], hint: 'BURN THE WISPS BEFORE THEY GET AWAY: EIGHT OF TWELVE', fails: 'too many get away: begin again', reads: 'a count' },
  puck: { name: 'THE PUCK', verbs: ['ram'], hint: 'RAM THE PUCK PAST THE GOALIE: THREE GOALS', fails: 'none: a game', reads: 'the score' },
  mirrors: { name: 'THE MIRRORS', verbs: ['ram', 'puzzle'], hint: 'RAM THE MIRRORS TO TURN THE BEAM ON THE RECEIVER', fails: 'none', reads: 'the beam' },
  thief: { name: 'THE THIEF', verbs: ['chase', 'flame', 'ram'], hint: 'A PILFERLING HAS STOLEN THE FLAME: CATCH IT', fails: 'none: it is still out there', reads: 'its glow', foes: true },
  siege: { name: 'THE SIEGE', verbs: ['fight'], hint: 'STEP INSIDE THE RING AND CLEAR THE WAVES', fails: 'he is set back: the waves begin again', reads: 'a count of foes', foes: true },
};
export const TRIAL_IDS = Object.keys(TRIALS);
