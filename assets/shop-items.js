/* Tung shop: the things a tung can wear, the four tiers they come in, and which six are for sale today.
   Shared by the server (it checks every buy and equip) and the arena page (it draws them), so the list lives in one place.
   The ORDER of ITEMS is part of the data: the arena sends each tung's gear as numbers (position + 1), so only add to the END. */
(function (root) {
  const SLOTS = ['hat', 'face', 'bat', 'color', 'wear', 'trail'];
  const SLOT_NAMES = { hat: 'Hat', face: 'Face', bat: 'Bat', color: 'Colour', wear: 'Outfit', trail: 'Trail' };
  // Four tiers, from common to legendary. The higher the tier, the pricier it is and the less often it is in the shop.
  const TIERS = { 1: 'Tung', 2: 'Tung Tung', 3: 'Tung Tung Tung', 4: 'Triple T Sahur' };
  const PRICE = { 1: 2, 2: 4, 3: 7, 4: 12 }; // in tung bucks: one buck for every multiplayer win
  const TIER_WEIGHT = { 1: 60, 2: 28, 3: 10, 4: 2 }; // how likely a tier is to be picked for a slot on a given day (percent-ish)
  const TIER_OF = { common: 1, uncommon: 2, rare: 3, epic: 4 };

  const ITEMS = [
    // hats
    { id: 'party', slot: 'hat', name: 'Party hat', tier: 1 },
    { id: 'beanie', slot: 'hat', name: 'Blue beanie', tier: 1 },
    { id: 'cowboy', slot: 'hat', name: 'Cowboy hat', tier: 2 },
    { id: 'chef', slot: 'hat', name: 'Chef hat', tier: 2 },
    { id: 'tophat', slot: 'hat', name: 'Top hat', tier: 2 },
    { id: 'propeller', slot: 'hat', name: 'Propeller cap', tier: 3 },
    { id: 'crown', slot: 'hat', name: 'Golden crown', tier: 4 },
    { id: 'halo', slot: 'hat', name: 'Halo', tier: 4 },
    // faces
    { id: 'sunglasses', slot: 'face', name: 'Sunglasses', tier: 1 },
    { id: 'mustache', slot: 'face', name: 'Big mustache', tier: 1 },
    { id: 'monocle', slot: 'face', name: 'Monocle', tier: 2 },
    { id: 'bandana', slot: 'face', name: 'Red bandana', tier: 2 },
    { id: 'heartshades', slot: 'face', name: 'Heart shades', tier: 3 },
    // bats
    { id: 'candy', slot: 'bat', name: 'Candy cane bat', tier: 1 },
    { id: 'baguette', slot: 'bat', name: 'Baguette', tier: 2 },
    { id: 'ice', slot: 'bat', name: 'Ice bat', tier: 3 },
    { id: 'flame', slot: 'bat', name: 'Flame bat', tier: 3 },
    { id: 'goldbat', slot: 'bat', name: 'Golden bat', tier: 4 },
    // colours
    { id: 'mint', slot: 'color', name: 'Mint log', tier: 1, fill: '#8fe3c0' },
    { id: 'sky', slot: 'color', name: 'Sky log', tier: 1, fill: '#8fc9ff' },
    { id: 'rose', slot: 'color', name: 'Rose log', tier: 2, fill: '#ff9ec4' },
    { id: 'midnight', slot: 'color', name: 'Midnight log', tier: 2, fill: '#4b5190' },
    { id: 'lava', slot: 'color', name: 'Lava log', tier: 3, fill: '#ff6a3d' },
    { id: 'goldlog', slot: 'color', name: 'Solid gold log', tier: 4, fill: '#ffd23f' },
    // outfits
    { id: 'bowtie', slot: 'wear', name: 'Red bow tie', tier: 1 },
    { id: 'scarf', slot: 'wear', name: 'Winter scarf', tier: 1 },
    { id: 'tee', slot: 'wear', name: 'Tung tee', tier: 2 },
    { id: 'cape', slot: 'wear', name: 'Hero cape', tier: 3 },
    // trails
    { id: 'bubbles', slot: 'trail', name: 'Bubble trail', tier: 1 },
    { id: 'sparkles', slot: 'trail', name: 'Sparkle trail', tier: 2 },
    { id: 'flames', slot: 'trail', name: 'Flame trail', tier: 3 },
    { id: 'hearts', slot: 'trail', name: 'Heart trail', tier: 3 },

    // ---- 50 more: add new things only to the END (see the note at the top) ----
    // hats
    { id: 'bucket', slot: 'hat', name: 'Bucket hat', tier: 1 },
    { id: 'cap', slot: 'hat', name: 'Red cap', tier: 1 },
    { id: 'headband', slot: 'hat', name: 'Sweatband', tier: 1 },
    { id: 'wizard', slot: 'hat', name: 'Wizard hat', tier: 2 },
    { id: 'pirate', slot: 'hat', name: 'Pirate hat', tier: 2 },
    { id: 'santa', slot: 'hat', name: 'Santa hat', tier: 2 },
    { id: 'viking', slot: 'hat', name: 'Viking helmet', tier: 2 },
    { id: 'flower', slot: 'hat', name: 'Flower crown', tier: 2 },
    { id: 'knight', slot: 'hat', name: 'Knight helmet', tier: 3 },
    { id: 'astronaut', slot: 'hat', name: 'Space helmet', tier: 3 },
    { id: 'sombrero', slot: 'hat', name: 'Sombrero', tier: 3 },
    { id: 'pharaoh', slot: 'hat', name: 'Pharaoh headdress', tier: 3 },
    { id: 'flamecrown', slot: 'hat', name: 'Crown of flames', tier: 4 },
    { id: 'unicorn', slot: 'hat', name: 'Unicorn horn', tier: 4 },
    // faces
    { id: 'glasses', slot: 'face', name: 'Round glasses', tier: 1 },
    { id: 'eyepatch', slot: 'face', name: 'Eyepatch', tier: 1 },
    { id: 'blush', slot: 'face', name: 'Rosy cheeks', tier: 1 },
    { id: 'goggles', slot: 'face', name: 'Swim goggles', tier: 2 },
    { id: 'beard', slot: 'face', name: 'Big beard', tier: 2 },
    { id: 'clownnose', slot: 'face', name: 'Clown nose', tier: 2 },
    { id: 'visor', slot: 'face', name: 'Cyber visor', tier: 3 },
    { id: 'laser', slot: 'face', name: 'Laser eyes', tier: 4 },
    // bats
    { id: 'rolling', slot: 'bat', name: 'Rolling pin', tier: 1 },
    { id: 'carrot', slot: 'bat', name: 'Carrot bat', tier: 1 },
    { id: 'pencil', slot: 'bat', name: 'Giant pencil', tier: 2 },
    { id: 'leek', slot: 'bat', name: 'Leek', tier: 2 },
    { id: 'neon', slot: 'bat', name: 'Neon tube', tier: 3 },
    { id: 'cactus', slot: 'bat', name: 'Cactus bat', tier: 3 },
    { id: 'lightning', slot: 'bat', name: 'Lightning bolt', tier: 4 },
    { id: 'galaxybat', slot: 'bat', name: 'Galaxy bat', tier: 4 },
    // skins
    { id: 'lemon', slot: 'color', name: 'Lemon log', tier: 1, fill: '#ffe66d' },
    { id: 'lilac', slot: 'color', name: 'Lilac log', tier: 1, fill: '#c9a7ff' },
    { id: 'tiger', slot: 'color', name: 'Tiger skin', tier: 2, fill: '#ff9a3c', pattern: 'tiger' },
    { id: 'polka', slot: 'color', name: 'Polka-dot skin', tier: 2, fill: '#ff7aa8', pattern: 'polka' },
    { id: 'checker', slot: 'color', name: 'Checker skin', tier: 2, fill: '#f4f4f4', pattern: 'checker' },
    { id: 'camo', slot: 'color', name: 'Camo skin', tier: 3, fill: '#6b8e3d', pattern: 'camo' },
    { id: 'ocean', slot: 'color', name: 'Ocean skin', tier: 3, fill: '#4cc9f0', fill2: '#1d4e89', pattern: 'ocean' },
    { id: 'sunset', slot: 'color', name: 'Sunset skin', tier: 3, fill: '#ff9a3c', fill2: '#6a4fb3', pattern: 'sunset' },
    { id: 'galaxy', slot: 'color', name: 'Galaxy skin', tier: 4, fill: '#2a1560', fill2: '#6b2fb8', pattern: 'galaxy' },
    { id: 'rainbow', slot: 'color', name: 'Rainbow skin', tier: 4, fill: '#ff5a5a', pattern: 'rainbow' },
    // outfits
    { id: 'badge', slot: 'wear', name: 'Star badge', tier: 1 },
    { id: 'lei', slot: 'wear', name: 'Flower lei', tier: 2 },
    { id: 'jersey', slot: 'wear', name: 'Number 1 jersey', tier: 2 },
    { id: 'armor', slot: 'wear', name: 'Knight armour', tier: 3 },
    { id: 'tux', slot: 'wear', name: 'Fancy tuxedo', tier: 3 },
    { id: 'wings', slot: 'wear', name: 'Angel wings', tier: 4 },
    // trails
    { id: 'dust', slot: 'trail', name: 'Dust trail', tier: 1 },
    { id: 'leaves', slot: 'trail', name: 'Falling leaves', tier: 2 },
    { id: 'music', slot: 'trail', name: 'Music notes', tier: 3 },
    { id: 'rainbowtrail', slot: 'trail', name: 'Rainbow trail', tier: 4 },

    // ---- 50 more ----
    // hats
    { id: 'sailor', slot: 'hat', name: 'Sailor cap', tier: 1 },
    { id: 'beret', slot: 'hat', name: 'Red beret', tier: 1 },
    { id: 'straw', slot: 'hat', name: 'Straw hat', tier: 1 },
    { id: 'graduate', slot: 'hat', name: 'Graduation cap', tier: 2 },
    { id: 'cat', slot: 'hat', name: 'Cat ears', tier: 2 },
    { id: 'mushroom', slot: 'hat', name: 'Mushroom cap', tier: 2 },
    { id: 'bunny', slot: 'hat', name: 'Bunny ears', tier: 2 },
    { id: 'samurai', slot: 'hat', name: 'Samurai helmet', tier: 3 },
    { id: 'jester', slot: 'hat', name: 'Jester hat', tier: 3 },
    { id: 'headphones', slot: 'hat', name: 'DJ headphones', tier: 3 },
    { id: 'stormcloud', slot: 'hat', name: 'Storm cloud', tier: 4 },
    { id: 'phoenix', slot: 'hat', name: 'Phoenix crest', tier: 4 },
    // faces
    { id: 'bigbrows', slot: 'face', name: 'Bushy eyebrows', tier: 1 },
    { id: 'bandaid', slot: 'face', name: 'Band-aid', tier: 1 },
    { id: 'whiskers', slot: 'face', name: 'Cat whiskers', tier: 1 },
    { id: 'glasses3d', slot: 'face', name: '3D glasses', tier: 2 },
    { id: 'vampire', slot: 'face', name: 'Vampire fangs', tier: 2 },
    { id: 'ninja', slot: 'face', name: 'Ninja mask', tier: 3 },
    { id: 'robot', slot: 'face', name: 'Robot eyes', tier: 3 },
    { id: 'thirdeye', slot: 'face', name: 'Cosmic third eye', tier: 4 },
    // bats
    { id: 'spoon', slot: 'bat', name: 'Wooden spoon', tier: 1 },
    { id: 'fish', slot: 'bat', name: 'Big fish', tier: 1 },
    { id: 'lollipop', slot: 'bat', name: 'Giant lollipop', tier: 2 },
    { id: 'bone', slot: 'bat', name: 'Bone', tier: 2 },
    { id: 'katana', slot: 'bat', name: 'Katana', tier: 3 },
    { id: 'trident', slot: 'bat', name: 'Golden trident', tier: 3 },
    { id: 'plasma', slot: 'bat', name: 'Plasma saber', tier: 4 },
    { id: 'aurora', slot: 'bat', name: 'Aurora staff', tier: 4 },
    // skins
    { id: 'peach', slot: 'color', name: 'Peach log', tier: 1, fill: '#ffb38a' },
    { id: 'slate', slot: 'color', name: 'Slate log', tier: 1, fill: '#8a9bb0' },
    { id: 'stars', slot: 'color', name: 'Starry skin', tier: 2, fill: '#2b3a8f', pattern: 'stars' },
    { id: 'zigzag', slot: 'color', name: 'Zigzag skin', tier: 2, fill: '#ff7a7a', pattern: 'zigzag' },
    { id: 'marble', slot: 'color', name: 'Marble skin', tier: 3, fill: '#f2f2f2', pattern: 'marble' },
    { id: 'magma', slot: 'color', name: 'Magma skin', tier: 3, fill: '#3a1c14', fill2: '#150b0b', pattern: 'magma' },
    { id: 'gridskin', slot: 'color', name: 'Cyber grid skin', tier: 4, fill: '#0b1030', pattern: 'grid' },
    { id: 'prism', slot: 'color', name: 'Prism skin', tier: 4, fill: '#9b6bff', pattern: 'prism' },
    // outfits
    { id: 'overalls', slot: 'wear', name: 'Denim overalls', tier: 1 },
    { id: 'hoodie', slot: 'wear', name: 'Grey hoodie', tier: 1 },
    { id: 'raincoat', slot: 'wear', name: 'Yellow raincoat', tier: 2 },
    { id: 'sweater', slot: 'wear', name: 'Ugly sweater', tier: 2 },
    { id: 'labcoat', slot: 'wear', name: 'Lab coat', tier: 3 },
    { id: 'royalrobe', slot: 'wear', name: 'Royal robe', tier: 3 },
    { id: 'medal', slot: 'wear', name: 'Champion medal', tier: 3 },
    { id: 'jetpack', slot: 'wear', name: 'Jetpack', tier: 4 },
    // trails
    { id: 'confetti', slot: 'trail', name: 'Confetti trail', tier: 1 },
    { id: 'snow', slot: 'trail', name: 'Snowflake trail', tier: 1 },
    { id: 'coins', slot: 'trail', name: 'Coin trail', tier: 2 },
    { id: 'petals', slot: 'trail', name: 'Petal trail', tier: 2 },
    { id: 'zaps', slot: 'trail', name: 'Electric zaps', tier: 3 },
    { id: 'comet', slot: 'trail', name: 'Comet trail', tier: 4 },
  ];
  const byId = {};
  ITEMS.forEach((it, i) => { it.n = i + 1; it.price = PRICE[it.tier]; byId[it.id] = it; });

  // The shop changes every day at 8:00 AM US Eastern time (it follows daylight saving). Everybody sees the same six items:
  // one for each slot, picked from the date. The higher the tier, the less likely it is to be picked (see TIER_WEIGHT).
  const RESET_HOUR = 8, RESET_TZ = 'America/New_York';
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: RESET_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function wall(ms) { const o = {}; for (const p of fmt.formatToParts(new Date(ms))) o[p.type] = p.value; return { y: +o.year, m: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute, s: +o.second }; }
  const wallUtc = (ms) => { const w = wall(ms); return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s); }; // the Eastern clock reading, as if it were UTC
  // the "shop day": the Eastern date, but a day only starts at 8:00 AM
  const todayStr = (now) => { const t = now == null ? Date.now() : now, w = wall(t); return new Date(Date.UTC(w.y, w.m - 1, w.d, w.h - RESET_HOUR, w.mi, w.s)).toISOString().slice(0, 10); };
  function msUntilReset(now) {
    const t = now == null ? Date.now() : now, w = wall(t);
    const nextWall = Date.UTC(w.y, w.m - 1, w.d + (w.h >= RESET_HOUR ? 1 : 0), RESET_HOUR, 0, 0);
    let at = nextWall - (wallUtc(t) - t);
    at = nextWall - (wallUtc(at) - at); // in case the clocks change in between
    return at - t;
  }
  function hash(str) { let a = 2166136261; for (let i = 0; i < str.length; i++) a = Math.imul(a ^ str.charCodeAt(i), 16777619) >>> 0; a ^= a >>> 15; a = Math.imul(a, 2246822519) >>> 0; a ^= a >>> 13; a = Math.imul(a, 3266489917) >>> 0; return (a ^ (a >>> 16)) >>> 0; }
  function offerFor(dateStr) {
    return SLOTS.map((slot) => {
      const list = ITEMS.filter((it) => it.slot === slot);
      const tiers = [1, 2, 3, 4].filter((t) => list.some((it) => it.tier === t));
      const total = tiers.reduce((n, t) => n + TIER_WEIGHT[t], 0);
      let roll = (hash(dateStr + '|' + slot + '|tier') / 4294967296) * total, tier = tiers[tiers.length - 1];
      for (const t of tiers) { if (roll < TIER_WEIGHT[t]) { tier = t; break; } roll -= TIER_WEIGHT[t]; }
      const pool = list.filter((it) => it.tier === tier);
      return pool[hash(dateStr + '|' + slot + '|' + tier) % pool.length].id;
    });
  }

  // how likely an item is to be in a given day's shop (0..1): its tier gets picked for the slot, then it is one of that tier's items
  function chanceOf(it) {
    const list = ITEMS.filter((x) => x.slot === it.slot);
    const tiers = [1, 2, 3, 4].filter((t) => list.some((x) => x.tier === t));
    const total = tiers.reduce((n, t) => n + TIER_WEIGHT[t], 0);
    return (TIER_WEIGHT[it.tier] / total) / list.filter((x) => x.tier === it.tier).length;
  }

  const api = { chanceOf, SLOTS, SLOT_NAMES, TIERS, PRICE, TIER_WEIGHT, ITEMS, byId, todayStr, offerFor, msUntilReset };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TungShop = api;
})(typeof window !== 'undefined' ? window : globalThis);
