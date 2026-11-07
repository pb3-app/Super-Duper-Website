/* Tung Up! game data: characters, bats, power-ups and chaos events. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.TungLoad = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // speed (px/s) / jump (launch speed) / weight (1 = normal; higher = flung less) / airJumps / float
  const TUNGS = {
    classic: { id: 'classic', name: 'Tung Tung Sahur', pal: 'brown', hp: 100, speed: 250, jump: 860, weight: 1.0, airJumps: 0, float: false, blurb: 'The original log. Good at everything.', hat: null },
    bulky: { id: 'bulky', name: 'Big Sahur', pal: 'red', hp: 135, speed: 218, jump: 840, weight: 1.4, airJumps: 0, float: false, blurb: 'A huge log. Hard to knock off, slow to run.', hat: 'helmet' },
    speedy: { id: 'speedy', name: 'Zoom Tung', pal: 'blue', hp: 80, speed: 290, jump: 870, weight: 0.85, airJumps: 0, float: false, blurb: 'Fast and slippery, but fragile.', hat: 'cap' },
    springy: { id: 'springy', name: 'Boing Tung', pal: 'green', hp: 90, speed: 235, jump: 945, weight: 1.0, airJumps: 0, float: false, blurb: 'Springs in its roots: the highest jump.', hat: 'sprout' },
    golden: { id: 'golden', name: 'Golden Tung', pal: 'gold', hp: 85, speed: 245, jump: 860, weight: 0.95, airJumps: 1, float: false, blurb: 'Can jump a second time in mid-air.', hat: 'crown' },
    ghost: { id: 'ghost', name: 'Ghost Tung', pal: 'ghost', hp: 90, speed: 240, jump: 860, weight: 0.8, airJumps: 0, float: true, blurb: 'Hold jump while falling to glide. Light as air.', hat: 'halo' },
  };
  // dmg / knock (launch speed) / swing (seconds) / reach (px) / stun / slow / moveMul
  const BATS = {
    classic: { id: 'classic', name: 'Classic Bat', dmg: 16, knock: 560, swing: 0.34, reach: 62, stun: 0.3, slow: null, moveMul: 1, blurb: 'The reliable wooden bat.', col: '#d9a566', dark: '#8c5a2a' },
    heavy: { id: 'heavy', name: 'Heavy Log', dmg: 28, knock: 840, swing: 0.68, reach: 56, stun: 0.45, slow: null, moveMul: 0.92, blurb: 'Huge damage and knockback, but a slow swing.', col: '#9a6a36', dark: '#4e2f12' },
    twig: { id: 'twig', name: 'Speedy Twig', dmg: 9, knock: 340, swing: 0.2, reach: 52, stun: 0.18, slow: null, moveMul: 1.05, blurb: 'Lightning-fast jabs for small hits.', col: '#b78b4e', dark: '#6b4a1e' },
    noodle: { id: 'noodle', name: 'Spaghetti Noodle', dmg: 12, knock: 420, swing: 0.42, reach: 104, stun: 0.25, slow: null, moveMul: 1, blurb: 'Hits from far away.', col: '#f4d77a', dark: '#c79a2a' },
    mallet: { id: 'mallet', name: 'Golden Mallet', dmg: 18, knock: 470, swing: 0.52, reach: 58, stun: 0.85, slow: null, moveMul: 0.96, blurb: 'Stuns whoever it hits.', col: '#ffd23f', dark: '#b8860b' },
    frost: { id: 'frost', name: 'Frost Pop', dmg: 13, knock: 440, swing: 0.36, reach: 62, stun: 0.25, slow: { f: 0.55, t: 2.4 }, moveMul: 1, blurb: 'Slows everyone it hits.', col: '#8fd9ff', dark: '#2a82c4' },
  };
  // weights are used for random draws; "others" items only appear when there is someone to hit
  const ITEMS = {
    rocket: { id: 'rocket', name: 'Rocket Boost', icon: '🚀', w: 8, desc: 'Blasts you straight up.' },
    spring: { id: 'spring', name: 'Spring Shoes', icon: '🦘', w: 10, desc: 'Super-high jumps for 10 s.' },
    shield: { id: 'shield', name: 'Bubble Shield', icon: '🛡️', w: 10, desc: 'Blocks the next hits and hazards (10 s).' },
    megabat: { id: 'megabat', name: 'Mega Bat', icon: '🏏', w: 9, desc: 'A giant bat with extra damage for 9 s.' },
    soda: { id: 'soda', name: 'Speed Soda', icon: '🥤', w: 10, desc: 'Run 40% faster for 8 s.' },
    feather: { id: 'feather', name: 'Feather Fall', icon: '🪶', w: 8, desc: 'Float down slowly for 10 s.' },
    heal: { id: 'heal', name: 'Healing Drum', icon: '🥁', w: 9, desc: 'Restores 45 health.' },
    hook: { id: 'hook', name: 'Tung Hook', icon: '🪝', w: 10, desc: 'Grapples up to the next ledge.' },
    banana: { id: 'banana', name: 'Banana Peel', icon: '🍌', w: 8, others: true, desc: 'Drops a peel that sends racers sliding.' },
    ink: { id: 'ink', name: 'Ink Bomb', icon: '🦑', w: 8, others: true, desc: 'Splats ink over everyone else\'s screen.' },
    invert: { id: 'invert', name: 'Invert Zap', icon: '🙃', w: 7, others: true, desc: 'Flips everyone else\'s left and right.' },
  };
  // dur seconds; w = chance weight. Every event is announced 2.5 seconds ahead.
  const EVENTS = {
    quake: { id: 'quake', name: 'EARTHQUAKE', icon: '🌋', dur: 6, w: 8, tip: 'The ground shakes and shoves you around!' },
    meteors: { id: 'meteors', name: 'METEOR SHOWER', icon: '☄️', dur: 9, w: 10, tip: 'Rocks are falling from the sky!' },
    lightning: { id: 'lightning', name: 'LIGHTNING STORM', icon: '⚡', dur: 8, w: 8, tip: 'Watch for the warning line, then move!' },
    wind: { id: 'wind', name: 'GALE FORCE WIND', icon: '💨', dur: 8, w: 9, tip: 'Strong gusts push you sideways.' },
    tornado: { id: 'tornado', name: 'TORNADO', icon: '🌪️', dur: 10, w: 6, tip: 'A twister sweeps through. It might even lift you up!' },
    invert: { id: 'invert', name: 'INVERTED CONTROLS', icon: '🙃', dur: 8, w: 8, tip: 'Left is right and right is left!' },
    ink: { id: 'ink', name: 'INK SPLATS', icon: '🦑', dur: 10, w: 8, tip: 'Ink hits the screen. Swing your bat to wipe it!' },
    blackout: { id: 'blackout', name: 'BLACKOUT', icon: '🌑', dur: 7, w: 6, tip: 'The lights are out. Stay near your glow.' },
    lowgrav: { id: 'lowgrav', name: 'LOW GRAVITY', icon: '🎈', dur: 9, w: 7, tip: 'Everything floats. Jump high!' },
    ice: { id: 'ice', name: 'FLASH FREEZE', icon: '🧊', dur: 9, w: 7, tip: 'Every platform is slippery ice.' },
    bananas: { id: 'bananas', name: 'BANANA RAIN', icon: '🍌', dur: 8, w: 6, tip: 'Peels are falling. Do not slip!' },
    sweep: { id: 'sweep', name: 'GIANT BAT SWEEP', icon: '🏏', dur: 8, w: 7, tip: 'A huge bat sweeps across: jump over the red band!' },
    dizzy: { id: 'dizzy', name: 'DIZZY SPELL', icon: '😵‍💫', dur: 8, w: 5, tip: 'The whole world is swaying.' },
  };
  return { TUNGS, BATS, ITEMS, EVENTS, TUNG_IDS: Object.keys(TUNGS), BAT_IDS: Object.keys(BATS) };
});
