// Tung Boxing and Dizzy Tungs: you must be logged in to play. Shows a full-screen "log in" box until you are, and uses your
// account name as your name in the game (the site keeps your online wins and losses under it).
(function () {
  const T = window.TungMP, gate = document.getElementById("gate");
  if (!T || !gate) return;
  const title = document.getElementById("gateTitle"), text = document.getElementById("gateText"), btn = document.getElementById("gateBtn");
  function refresh() {
    const nameBox = document.getElementById("name");
    if (T.offline) { title.textContent = "This game needs the game server"; text.textContent = "Start it with npm start, then reload this page."; btn.hidden = true; gate.hidden = false; return; }
    if (!T.user) { title.textContent = "Log in to play"; text.textContent = "Your account keeps your online wins and losses, and shows your name in the game."; btn.hidden = false; gate.hidden = false; return; }
    gate.hidden = true;
    if (nameBox) { nameBox.value = T.user.username; nameBox.readOnly = true; nameBox.title = "Your account name"; }
  }
  btn.addEventListener("click", () => T.openAuth());
  T.on("ready", refresh); T.on("logout", refresh); T.booted.then(refresh);
  window.tungLoginGate = refresh;
})();
