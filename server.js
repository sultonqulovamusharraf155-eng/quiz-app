// Prompt Quiz: PIN kod bilan kiriladigan jonli viktorina serveri (qo‘shimcha paket kerak emas).
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const rooms = new Map(); // pin -> {token, host, players: Map(id->res), last, seen}
const urls = () => Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => `http://${i.address}:${PORT}`);
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const sse = (res, obj) => res.write('data: ' + JSON.stringify(obj) + '\n\n');
function body(req) {
  return new Promise(ok => { let s = ''; req.on('data', c => { s += c; if (s.length > 20000) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { ok({}); } }); });
}
setInterval(() => { const now = Date.now(); for (const [p, r] of rooms) if (now - r.seen > 6 * 3600e3) rooms.delete(p); }, 600e3);

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  }
  if (u.pathname === '/api/info') return json(res, 200, { urls: urls() });
  if (u.pathname === '/api/check') return json(res, 200, { ok: rooms.has(u.searchParams.get('pin')) });
  if (req.method === 'POST' && u.pathname === '/api/create') {
    let pin; do { pin = String(Math.floor(100000 + Math.random() * 900000)); } while (rooms.has(pin));
    const token = crypto.randomBytes(12).toString('hex');
    rooms.set(pin, { token, host: null, players: new Map(), last: null, seen: Date.now() });
    return json(res, 200, { pin, token });
  }
  if (req.method === 'GET' && u.pathname === '/api/events') {
    const r = rooms.get(u.searchParams.get('pin')), id = (u.searchParams.get('id') || '').slice(0, 40), tk = u.searchParams.get('token');
    if (!r || !id) return json(res, 404, { error: 'room' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': ok\n\n');
    const isHost = tk && tk === r.token;
    if (isHost) r.host = res; else { r.players.set(id, res); if (r.last) sse(res, { topic: 'state', data: r.last }); }
    const ka = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(ka); if (isHost) { if (r.host === res) r.host = null; } else if (r.players.get(id) === res) r.players.delete(id); });
    return;
  }
  if (req.method === 'POST' && u.pathname === '/api/send') {
    const b = await body(req), r = rooms.get(b.pin);
    if (!r) return json(res, 404, { error: 'room' });
    r.seen = Date.now();
    if (b.token && b.token === r.token) {
      if (b.topic === 'state') { r.last = b.data; r.players.forEach(p => sse(p, { topic: 'state', data: b.data })); }
    } else if ((b.topic === 'join' || b.topic === 'answer') && r.host) {
      sse(r.host, { topic: b.topic, data: b.data, peer: String(b.id || '').slice(0, 40) });
    }
    return json(res, 200, { ok: true });
  }
  json(res, 404, { error: 'not found' });
}).listen(PORT, '0.0.0.0', () => {
    console.log('Prompt Quiz ishga tushdi.');
    console.log('Boshqaruvchi: http://localhost:' + PORT);
    urls().forEach(x => console.log('Ishtirokchilar (shu Wi-Fi): ' + x));
});
