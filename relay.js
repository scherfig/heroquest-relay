// HeroQuest Pixel relay: sender beskeder mellem spillere i samme rum. Kører ikke selve spillet.
const http = require('http');
const { WebSocketServer } = require('ws');
const port = process.env.PORT || 8080;
const srv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('HeroQuest relay ok'); });
const wss = new WebSocketServer({ server: srv });
srv.listen(port);
const rooms = {};          // kode -> { host: ws, players: {id: ws}, next: 1 }
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function code() { let c; do { c = ''; for (let i = 0; i < 4; i++) c += ABC[Math.floor(Math.random() * ABC.length)]; } while (rooms[c]); return c; }
function send(ws, o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
wss.on('connection', ws => {
  ws.alive = true; ws.on('pong', () => ws.alive = true);
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'host') {
      const c = code(); rooms[c] = { players: { 0: ws }, next: 1 };
      ws.room = c; ws.pid = 0; send(ws, { t: 'hosted', code: c, id: 0 });
    } else if (m.t === 'join') {
      const r = rooms[String(m.code || '').toUpperCase()];
      if (!r) return send(ws, { t: 'err', msg: 'Ingen spil med den kode' });
      if (r.locked) return send(ws, { t: 'err', msg: 'Spillet er allerede startet' });
      if (Object.keys(r.players).length >= 4) return send(ws, { t: 'err', msg: 'Spillet er fyldt' });
      const id = r.next++; r.players[id] = ws; ws.room = String(m.code).toUpperCase(); ws.pid = id;
      send(ws, { t: 'joined', id }); send(r.players[0], { t: 'peer_join', id });
    } else if (m.t === 'lock') {
      if (ws.pid === 0 && rooms[ws.room]) rooms[ws.room].locked = true;
    } else if (m.t === 'msg') {
      const r = rooms[ws.room]; if (!r) return;
      const o = { t: 'msg', from: ws.pid, d: m.d };
      if (m.to === 'all' || m.to === undefined) { for (const id in r.players) if (+id !== ws.pid) send(r.players[id], o); }
      else send(r.players[m.to], o);
    }
  });
  ws.on('close', () => {
    const r = rooms[ws.room]; if (!r) return;
    delete r.players[ws.pid];
    if (ws.pid === 0) { for (const id in r.players) { send(r.players[id], { t: 'host_left' }); r.players[id].close(); } delete rooms[ws.room]; }
    else send(r.players[0], { t: 'peer_left', id: ws.pid });
  });
});
setInterval(() => wss.clients.forEach(c => { if (!c.alive) return c.terminate(); c.alive = false; c.ping(); }), 30000);
console.log('HeroQuest relay lytter på port ' + port);
