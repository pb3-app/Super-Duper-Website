# Tung Tung Sahur Arena

A real-time multiplayer browser game. Players are wooden logs with bats who run around an arena and bonk each other.

```
client/     the website (Amplify hosts this)
server/     the game server (runs on an EC2 instance)
amplify.yml tells Amplify to publish only the client/ folder
```

## Play it on your own computer

1. Install Node.js (version 18 or newer) from nodejs.org.
2. In a terminal:
   ```
   cd server
   npm install
   npm start
   ```
3. In a second terminal, from the project folder, run `npx http-server client -p 8080`.
4. Open http://localhost:8080 in two browser tabs. Each tab is a player.

## How the game works

- The **server** (`server/server.js`) is the boss. It runs the game 30 times a second, moves everyone and decides who got bonked, then sends everyone a snapshot.
- The **browser** (`client/game.js`) only sends key presses and mouse aim, then draws the snapshots. It draws about 100 ms behind real time and blends between snapshots so movement looks smooth.
- Game settings (speed, knockback, arena size and so on) are at the top of `server/server.js`.

## Put it online

### 1. Website on Amplify (free `*.amplifyapp.com` address)
1. Push this folder to a GitHub repo.
2. AWS console → Amplify → Create new app → GitHub → pick the repo and the `main` branch.
3. Amplify reads `amplify.yml` and publishes `client/`. Every push to `main` redeploys automatically.

### 2. Game server on EC2
1. AWS console → EC2 → Launch instance: Amazon Linux 2023, `t4g.micro` or `t3.micro`.
2. Security group: allow inbound ports **22** (SSH), **80** and **443** (HTTPS).
3. Connect (EC2 Instance Connect button in the console works) and run:
   ```
   sudo dnf install -y nodejs git
   git clone https://github.com/YOUR-NAME/YOUR-REPO.git
   cd YOUR-REPO/server && npm install
   sudo npm install -g pm2
   pm2 start server.js --name tung
   pm2 save && pm2 startup   # then run the command it prints
   ```
4. Give the instance an **Elastic IP** (EC2 → Elastic IPs) so its address never changes.

### 3. HTTPS for the game server
The Amplify site is HTTPS, so browsers will only let it talk to an HTTPS game server.
1. Go to duckdns.org, sign in, create a subdomain (e.g. `tungtung`) and set its IP to your Elastic IP.
2. Install Caddy on the server (see caddyserver.com/docs/install), put `server/Caddyfile` (with your subdomain) at `/etc/caddy/Caddyfile`, then `sudo systemctl restart caddy`.
3. In `client/config.js`, replace `https://YOUR-SERVER-ADDRESS-HERE` with `https://tungtung.duckdns.org` and push.

### Updating the game server later
```
cd YOUR-REPO && git pull && cd server && npm install && pm2 restart tung
```

### Costs
Set a billing alert in AWS (Billing → Budgets). Stop the EC2 instance when nobody is playing to save credits.
