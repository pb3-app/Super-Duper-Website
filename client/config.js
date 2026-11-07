// Where the game server lives.
// - When you open the site on your own computer, it uses the local server.
// - On the real website (Amplify), it uses the address below.
//   Change it to your server's HTTPS address once it's set up (step 6 of the guide),
//   e.g. "https://tungtung.duckdns.org"
window.GAME_SERVER_URL =
  location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:"
    ? "http://localhost:3000"
    : "https://YOUR-SERVER-ADDRESS-HERE";
