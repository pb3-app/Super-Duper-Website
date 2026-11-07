/* Word bank for Tung Tung Pictionary (used by the server and by the solo sketchpad). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.PicWords = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const BANK = {
    easy: ['apple', 'banana', 'cat', 'dog', 'house', 'tree', 'sun', 'moon', 'star', 'fish', 'bird', 'car', 'boat', 'flower', 'cake', 'pizza', 'hat', 'shoe', 'ball', 'book', 'cup', 'key', 'door', 'chair', 'bed', 'clock', 'cloud', 'rain', 'snowman', 'heart', 'smile', 'eye', 'hand', 'foot', 'nose', 'egg', 'bread', 'milk', 'ice cream', 'balloon', 'candle', 'kite', 'drum', 'guitar', 'piano', 'bell', 'umbrella', 'rainbow', 'mountain', 'beach', 'bridge', 'train', 'bus', 'bike', 'plane', 'rocket', 'robot', 'ghost', 'pumpkin', 'cookie', 'donut', 'carrot', 'strawberry', 'watermelon', 'spider', 'snake', 'frog', 'duck', 'cow', 'pig', 'horse', 'sheep', 'rabbit', 'turtle', 'whale', 'shark', 'octopus', 'crab', 'butterfly'],
    medium: ['skateboard', 'volcano', 'lighthouse', 'pirate', 'castle', 'dragon', 'unicorn', 'mermaid', 'astronaut', 'submarine', 'helicopter', 'campfire', 'backpack', 'telescope', 'microscope', 'headphones', 'keyboard', 'camera', 'sandwich', 'hamburger', 'popcorn', 'cupcake', 'noodles', 'sushi', 'taco', 'cactus', 'palm tree', 'waterfall', 'tornado', 'thunderstorm', 'snowflake', 'penguin', 'giraffe', 'elephant', 'kangaroo', 'octopus', 'dinosaur', 'scarecrow', 'treasure map', 'magic wand', 'wizard', 'vampire', 'zombie', 'snowboard', 'trampoline', 'swing set', 'roller coaster', 'ferris wheel', 'hot air balloon', 'jellyfish', 'hedgehog', 'peacock', 'flamingo', 'basketball', 'soccer goal', 'baseball bat', 'boxing glove', 'bowling', 'chess board', 'video game', 'birthday party', 'fireworks', 'sleeping bag', 'light bulb', 'wheelbarrow', 'lawn mower', 'fire truck', 'ambulance', 'tractor'],
    hard: ['gravity', 'jealousy', 'echo', 'time travel', 'black hole', 'internet', 'traffic jam', 'deja vu', 'stage fright', 'paradox', 'recycling', 'democracy', 'allergy', 'nightmare', 'daydream', 'photosynthesis', 'earthquake', 'sunburn', 'brain freeze', 'homework', 'surprise party', 'awkward silence', 'static electricity', 'chain reaction', 'power outage', 'wifi password', 'group project', 'rush hour', 'bedtime story', 'lost in translation'],
    brainrot: ['tung tung sahur', 'tralalero tralala', 'bombardiro crocodilo', 'cappuccino assassino', 'ballerina cappuccina', 'chimpanzini bananini', 'brr brr patapim', 'lirili larila', 'trippi troppi', 'glorbo fruttodrillo', 'baseball bat', 'drumstick', 'log', 'crocodile bomber', 'shark in sneakers', 'monkey banana', 'coffee ballerina', 'ninja cappuccino', 'elephant cactus', 'frog cat'],
  };
  const flat = (d) => (d === 'any' ? [].concat(BANK.easy, BANK.medium, BANK.hard, BANK.brainrot) : BANK[d] || []);
  const pick = (n, used, diff) => {
    const pool = flat(diff || 'any').filter((w) => !(used && used.has(w)));
    const out = [];
    while (out.length < n && pool.length) { const i = Math.floor(Math.random() * pool.length); out.push(pool.splice(i, 1)[0]); }
    return out;
  };
  return { BANK, pick };
});
