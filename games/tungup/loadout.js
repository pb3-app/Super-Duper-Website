/* Tung Up! game data: characters, bats, power-ups and chaos events. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.TungLoad = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // speed (px/s) / jump (launch speed) / weight (1 = normal; higher = flung less) / airJumps / float
  const TUNGS = {
    classic: { id: 'classic', name: 'Tung Tung Sahur', pal: 'brown', hp: 100, speed: 240, jump: 800, weight: 1.0, airJumps: 0, float: false, blurb: 'The original log. Same stats as every Tung.', hat: null },
    bulky: { id: 'bulky', name: 'Big Sahur', pal: 'red', hp: 100, speed: 240, jump: 800, weight: 1.0, airJumps: 0, float: false, blurb: 'A bigger, redder log with a helmet. Same stats as every Tung.', hat: 'helmet' },
    speedy: { id: 'speedy', name: 'Zoom Tung', pal: 'blue', hp: 100, speed: 240, jump: 800, weight: 1.0, airJumps: 0, float: false, blurb: 'A blue log with a cap. Same stats as every Tung.', hat: 'cap' },
    springy: { id: 'springy', name: 'Boing Tung', pal: 'green', hp: 100, speed: 240, jump: 800, weight: 1.0, airJumps: 0, float: false, blurb: 'A green log with a sprout on top. Same stats as every Tung.', hat: 'sprout' },
    golden: { id: 'golden', name: 'Golden Tung', pal: 'gold', hp: 100, speed: 240, jump: 800, weight: 1.0, airJumps: 0, float: false, blurb: 'A golden log with a crown. Same stats as every Tung.', hat: 'crown' },
    ghost: { id: 'ghost', name: 'Ghost Tung', pal: 'ghost', hp: 100, speed: 240, jump: 800, weight: 1.0, airJumps: 0, float: false, blurb: 'A ghostly log with a halo. Same stats as every Tung.', hat: 'halo' },
  };
  // dmg / knock (launch speed) / swing (seconds) / reach (px) / stun / slow / moveMul
  const BATS = {
    classic: { id: 'classic', name: 'Classic Bat', dmg: 16, knock: 560, swing: 0.34, reach: 62, stun: 0.3, slow: null, moveMul: 1, blurb: 'The reliable wooden bat.', col: '#d9a566', dark: '#8c5a2a' },
    heavy: { id: 'heavy', name: 'Heavy Log', dmg: 16, knock: 560, swing: 0.34, reach: 62, stun: 0.3, slow: null, moveMul: 1, blurb: 'A big log of a bat. Same stats as every bat.', col: '#9a6a36', dark: '#4e2f12' },
    twig: { id: 'twig', name: 'Speedy Twig', dmg: 16, knock: 560, swing: 0.34, reach: 62, stun: 0.3, slow: null, moveMul: 1, blurb: 'A thin little twig. Same stats as every bat.', col: '#b78b4e', dark: '#6b4a1e' },
    noodle: { id: 'noodle', name: 'Spaghetti Noodle', dmg: 16, knock: 560, swing: 0.34, reach: 62, stun: 0.3, slow: null, moveMul: 1, blurb: 'A long spaghetti noodle. Same stats as every bat.', col: '#f4d77a', dark: '#c79a2a' },
    mallet: { id: 'mallet', name: 'Golden Mallet', dmg: 16, knock: 560, swing: 0.34, reach: 62, stun: 0.3, slow: null, moveMul: 1, blurb: 'A golden mallet. Same stats as every bat.', col: '#ffd23f', dark: '#b8860b' },
    frost: { id: 'frost', name: 'Frost Pop', dmg: 16, knock: 560, swing: 0.34, reach: 62, stun: 0.3, slow: null, moveMul: 1, blurb: 'An icy lolly. Same stats as every bat.', col: '#8fd9ff', dark: '#2a82c4' },
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
