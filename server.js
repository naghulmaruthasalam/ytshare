// Zero-dependency server: serves the static frontend and proxies the YouTube
// Data API v3 so the API key never reaches the browser.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Minimal .env loader (no dotenv dependency)
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { /* no .env file; rely on real environment variables */ }

const PORT = process.env.PORT || 3000;
const KEY = process.env.YOUTUBE_API_KEY;
const PUBLIC_DIR = path.join(__dirname, 'public');
const API = 'https://www.googleapis.com/youtube/v3';
const ID_RE = /^[\w-]{11}$/;

// --- tiny in-memory cache (protects the 10,000 units/day quota) ---
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;
function cached(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_TTL) return hit.v;
  cache.delete(key);
}
function remember(key, v) {
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  cache.set(key, { t: Date.now(), v });
}

// --- tiny per-IP rate limit: 60 API requests / minute ---
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const h = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  h.push(now);
  hits.set(ip, h);
  return h.length > 60;
}
setInterval(() => hits.clear(), 10 * 60_000).unref();

async function yt(endpoint, params) {
  const url = new URL(`${API}/${endpoint}`);
  for (const [k, v] of Object.entries({ ...params, key: KEY })) url.searchParams.set(k, v);
  const cacheKey = url.pathname + [...url.searchParams].filter(([k]) => k !== 'key').join('&');
  const hit = cached(cacheKey);
  if (hit) return hit;
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(body?.error?.message || 'YouTube API error');
    err.status = res.status === 403 ? 429 : 502; // quota/permission problems surface as 429
    throw err;
  }
  remember(cacheKey, body);
  return body;
}

const simplify = (item) => ({
  id: item.id?.videoId || item.id,
  title: item.snippet.title,
  channel: item.snippet.channelTitle,
  thumbnail: (item.snippet.thumbnails.medium || item.snippet.thumbnails.default || {}).url,
  published: item.snippet.publishedAt,
  duration: item.contentDetails?.duration,
  views: item.statistics?.viewCount,
});

const routes = {
  async '/api/search'(q) {
    const query = (q.get('q') || '').trim().slice(0, 200);
    if (!query) return { items: [] };
    const params = { part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '20', q: query };
    if (q.get('pageToken')) params.pageToken = q.get('pageToken');
    const body = await yt('search', params);
    return { items: body.items.map(simplify), nextPageToken: body.nextPageToken };
  },
  async '/api/trending'(q) {
    const body = await yt('videos', {
      part: 'snippet,contentDetails,statistics',
      chart: 'mostPopular',
      maxResults: '20',
      regionCode: (q.get('region') || 'US').slice(0, 2).toUpperCase(),
    });
    return { items: body.items.map(simplify) };
  },
  async '/api/video'(q) {
    const id = q.get('id') || '';
    if (!ID_RE.test(id)) throw Object.assign(new Error('Invalid video id'), { status: 400 });
    const body = await yt('videos', { part: 'snippet,contentDetails,statistics', id });
    if (!body.items.length) throw Object.assign(new Error('Video not found'), { status: 404 });
    return { ...simplify(body.items[0]), description: body.items[0].snippet.description };
  },
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
};
const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });

  const handler = routes[url.pathname];
  if (handler) {
    if (!KEY) return send(res, 500, { error: 'YOUTUBE_API_KEY is not set on the server (see .env.example)' });
    if (limited(req.socket.remoteAddress)) return send(res, 429, { error: 'Too many requests' });
    try {
      return send(res, 200, await handler(url.searchParams));
    } catch (e) {
      return send(res, e.status || 500, { error: e.message });
    }
  }

  // static files (path-traversal safe)
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
}).listen(PORT, () => console.log(`ytshare running on http://localhost:${PORT}${KEY ? '' : '  (YOUTUBE_API_KEY missing!)'}`));
