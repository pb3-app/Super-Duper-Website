/*
 * TUNG GAME REGISTRY
 * ------------------
 * To add a game:
 *   1. Create a folder for it, e.g.  games/my-game/index.html
 *   2. Add an entry to the array below.
 *
 * Example entry:
 *   {
 *     title: "Bonk Battle",
 *     description: "Bonk your friends with the wooden bat.",
 *     icon: "🏏",
 *     players: "2-4 players",
 *     url: "games/bonk-battle/index.html"
 *   }
 */
window.TUNG_GAMES = [
  {
    id: "snake",
    title: "Tung Snake",
    description: "Guide the Tung log, eat drums, grow longer. Don't bonk yourself.",
    icon: "🐍",
    players: "1 or 2 players",
    url: "games/snake/index.html"
  },
  {
    id: "minesweeper",
    title: "Tung Minesweeper",
    description: "Clear the field without waking the Tung Tung Tung Sahur.",
    icon: "💣",
    players: "1 or 2 players",
    url: "games/minesweeper/index.html"
  },
  {
    id: "sprouts",
    title: "Tung Sprouts",
    description: "Draw lines between dots, add a new dot each turn, and be the last one who can move.",
    icon: "🌱",
    players: "1 or 2 players",
    url: "games/sprouts/index.html"
  },
  {
    id: "imposter",
    title: "The Imposter",
    description: "One of you doesn't know the secret word. Give clues, spot the liar, and vote them out.",
    icon: "🕵️",
    players: "1 player (vs computer) or 4-8 online",
    url: "games/imposter/index.html"
  },
  { id: "pool", title: "Tung Pool", description: "Eight-ball against the computer or a friend.", icon: "🎱", players: "1 or 2 players", url: "games/pool/index.html" },
  { id: "slope", title: "Tung Slope", description: "Race down the slope without crashing.", icon: "🛷", players: "1 or 2 players", url: "games/slope/index.html" },
  { id: "brainrot", title: "Brainrot Merge", description: "Merge the Italian brainrot crew.", icon: "🧠", players: "1 or 2 players", url: "games/brainrot/index.html" },
  { id: "clicker", title: "Tung Clicker", description: "Click the log and build a crew. Saves your progress.", icon: "🖱️", players: "1 player", url: "games/clicker/index.html" },
  { id: "chess", title: "Tung Tung Chess", description: "Chess and Crazyhouse with brainrot pieces.", icon: "♟️", players: "1 or 2 players", url: "games/chess/index.html" },
  { id: "battleship", title: "Tung Battleship", description: "Sink the Tung log fleet with green Tung bombs.", icon: "🚢", players: "1 or 2 players", url: "games/battleship/index.html" },
  { id: "boxes", title: "Tung Dots & Boxes", description: "Close boxes and move again.", icon: "🔲", players: "1 or 2 players", url: "games/boxes/index.html" },
  { id: "uttt", title: "Tung Super Tic-Tac-Toe", description: "Nine boards, one winner.", icon: "❌", players: "1 or 2 players", url: "games/uttt/index.html" },
  { id: "hangman", title: "Tung Hangman", description: "Save Tung Tung Sahur from the gallows.", icon: "🪢", players: "1 or 2 players", url: "games/hangman/index.html" },
  { id: "flappy", title: "Flappy Tung", description: "Flap past the green Tungs.", icon: "🪵", players: "1 or 2 players", url: "games/flappy/index.html" },
  { id: "whack", title: "Whack-a-Tung", description: "Whack the Tungs, skip the green ones.", icon: "🔨", players: "1 or 2 players", url: "games/whack/index.html" },
  { id: "basketball", title: "Tung 2x2 Basketball", description: "Two on two, log style.", icon: "🏀", players: "1 or 2 players", url: "games/basketball/index.html" },
  { id: "f1", title: "Tung F1 Racing", description: "Six tracks, one chequered flag.", icon: "🏎️", players: "1 or 2 players", url: "games/f1/index.html" },
  { id: "paper", title: "Tung Paper.io", description: "Claim the paper, cut the trails.", icon: "📄", players: "1 or 2 players", url: "games/paper/index.html" },
  { id: "tungup", title: "Tung Up!", description: "An Only Up-style climb with bats, power-ups and chaos.", icon: "🧗", players: "1 player, 1v1 or rooms of up to 4", url: "games/tungup/index.html" },
  { id: "airhockey", title: "Tung Tung Air Hockey", description: "Slide the puck past the computer or a friend.", icon: "🏒", players: "1 or 2 players", url: "games/airhockey/index.html" },
  { id: "go", title: "Tung Tung Go", description: "The classic board game on 9x9, 13x13 or 19x19.", icon: "⚫", players: "1 or 2 players", url: "games/go/index.html" },
  { id: "bomber", title: "Tung Bomber Arena", description: "Blow up crates, grab power-ups, be the last Tung standing.", icon: "💣", players: "1 player, 1v1 or rooms of up to 4", url: "games/bomber/index.html" },
  { id: "sumo", title: "Tung Tung Sumo", description: "Shove every other Tung out of the ring.", icon: "🤼", players: "1 player, 1v1 or rooms of up to 4", url: "games/sumo/index.html" },
  { id: "golf", title: "Tung Tung Mini Golf", description: "Two courses of windmills, water and teleporters. Fewest strokes wins.", icon: "⛳", players: "1 or 2 players", url: "games/golf/index.html" },
  { id: "pictionary", title: "Tung Tung Pictionary", description: "Draw the secret word, guess the others'. Practice sketchpad when alone.", icon: "🎨", players: "Sketchpad, or rooms of 2 to 8", url: "games/pictionary/index.html" },
  { id: "archery", title: "Tung Tung Archery", description: "Read the wind, steady your breath and hit the gold.", icon: "🏹", players: "1 or 2 players", url: "games/archery/index.html" },
  { id: "cuppong", title: "Tung Tung Cup Pong", description: "Arc the ball into the cups. Sink two and throw again.", icon: "🥤", players: "1 or 2 players", url: "games/cuppong/index.html" },
  { id: "boxing", title: "Tung Boxing", description: "First-person boxing: dodge, counter, parry. 6 tungs, 5 opponents, or online 1v1.", icon: "🥊", players: "1 player or 2 online", url: "games/boxing/index.html" },
  { id: "dizzy", title: "Dizzy Tungs", description: "One button! Your tung never stops spinning. Throw bats, last tung standing wins.", icon: "🌀", players: "1-4 players, same screen or online", url: "games/dizzy/index.html" },
  // Add more games here
];
