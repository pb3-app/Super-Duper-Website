/* Tung shop: the things a tung can wear, and which six are for sale today.
   Shared by the server (it checks every buy and equip) and the arena page (it draws them), so the list lives in one place.
   The ORDER of ITEMS is part of the data: the arena sends each tung's gear as numbers (position + 1), so only add to the END. */
(function (root) {
  const SLOTS = ['hat', 'face', 'bat', 'color', 'wear', 'trail'];
  const SLOT_NAMES = { hat: 'Hat', face: 'Face', bat: 'Bat', color: 'Colour', wear: 'Outfit', trail: 'Trail' };
  const PRICE = { common: 2, uncommon: 4, rare: 7, epic: 12 }; // in tung bucks: one buck for every multiplayer win

  const ITEMS = [
    // hats
    { id: 'party', slot: 'hat', name: 'Party hat', rarity: 'common' },
    { id: 'beanie', slot: 'hat', name: 'Blue beanie', rarity: 'common' },
    { id: 'cowboy', slot: 'hat', name: 'Cowboy hat', rarity: 'uncommon' },
    { id: 'chef', slot: 'hat', name: 'Chef hat', rarity: 'uncommon' },
    { id: 'tophat', slot: 'hat', name: 'Top hat', rarity: 'uncommon' },
    { id: 'propeller', slot: 'hat', name: 'Propeller cap', rarity: 'rare' },
    { id: 'crown', slot: 'hat', name: 'Golden crown', rarity: 'epic' },
    { id: 'halo', slot: 'hat', name: 'Halo', rarity: 'epic' },
    // faces
    { id: 'sunglasses', slot: 'face', name: 'Sunglasses', rarity: 'common' },
    { id: 'mustache', slot: 'face', name: 'Big mustache', rarity: 'common' },
    { id: 'monocle', slot: 'face', name: 'Monocle', rarity: 'uncommon' },
    { id: 'bandana', slot: 'face', name: 'Red bandana', rarity: 'uncommon' },
    { id: 'heartshades', slot: 'face', name: 'Heart shades', rarity: 'rare' },
    // bats
    { id: 'candy', slot: 'bat', name: 'Candy cane bat', rarity: 'common' },
    { id: 'baguette', slot: 'bat', name: 'Baguette', rarity: 'uncommon' },
    { id: 'ice', slot: 'bat', name: 'Ice bat', rarity: 'rare' },
    { id: 'flame', slot: 'bat', name: 'Flame bat', rarity: 'rare' },
    { id: 'goldbat', slot: 'bat', name: 'Golden bat', rarity: 'epic' },
    // colours
    { id: 'mint', slot: 'color', name: 'Mint log', rarity: 'common', fill: '#8fe3c0' },
    { id: 'sky', slot: 'color', name: 'Sky log', rarity: 'common', fill: '#8fc9ff' },
    { id: 'rose', slot: 'color', name: 'Rose log', rarity: 'uncommon', fill: '#ff9ec4' },
    { id: 'midnight', slot: 'color', name: 'Midnight log', rarity: 'uncommon', fill: '#4b5190' },
    { id: 'lava', slot: 'color', name: 'Lava log', rarity: 'rare', fill: '#ff6a3d' },
    { id: 'goldlog', slot: 'color', name: 'Solid gold log', rarity: 'epic', fill: '#ffd23f' },
    // outfits
    { id: 'bowtie', slot: 'wear', name: 'Red bow tie', rarity: 'common' },
    { id: 'scarf', slot: 'wear', name: 'Winter scarf', rarity: 'common' },
    { id: 'tee', slot: 'wear', name: 'Tung tee', rarity: 'uncommon' },
    { id: 'cape', slot: 'wear', name: 'Hero cape', rarity: 'rare' },
    // trails
    { id: 'bubbles', slot: 'trail', name: 'Bubble trail', rarity: 'common' },
    { id: 'sparkles', slot: 'trail', name: 'Sparkle trail', rarity: 'uncommon' },
    { id: 'flames', slot: 'trail', name: 'Flame trail', rarity: 'rare' },
    { id: 'hearts', slot: 'trail', name: 'Heart trail', rarity: 'rare' },
  ];
  const byId = {};
  ITEMS.forEach((it, i) => { it.n = i + 1; it.price = PRICE[it.rarity]; byId[it.id] = it; });

  // today's shop: one item for each slot, picked from the date, so everyone sees the same six and it changes at midnight UTC
  const todayStr = (now) => new Date(now == null ? Date.now() : now).toISOString().slice(0, 10);
  function hash(str) { let a = 2166136261; for (let i = 0; i < str.length; i++) a = Math.imul(a ^ str.charCodeAt(i), 16777619) >>> 0; return a; }
  function offerFor(dateStr) {
    return SLOTS.map((slot) => {
      const list = ITEMS.filter((it) => it.slot === slot);
      return list[hash(dateStr + '|' + slot) % list.length].id;
    });
  }
  function msUntilReset(now) {
    const t = now == null ? Date.now() : now, d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - t;
  }

  const api = { SLOTS, SLOT_NAMES, PRICE, ITEMS, byId, todayStr, offerFor, msUntilReset };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TungShop = api;
})(typeof window !== 'undefined' ? window : globalThis);
