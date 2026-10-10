const $ = (id) => document.getElementById(id);
const state = { list: [], current: null, query: '', nextPageToken: null, player: null, apiReady: null };

// ---------- helpers ----------
const api = async (path) => {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
};
const showError = (msg) => { $('error').textContent = msg || ''; $('error').hidden = !msg; };
const toast = (msg) => { $('toast').textContent = msg; setTimeout(() => ($('toast').textContent = ''), 2500); };
const fmtViews = (n) => (n ? Intl.NumberFormat(undefined, { notation: 'compact' }).format(n) + ' views' : '');
const extractId = (s) => {
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/) || s.match(/^([\w-]{11})$/);
  return m && m[1];
};

// ---------- YouTube IFrame player ----------
function loadPlayerApi() {
  state.apiReady ||= new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = resolve;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.append(s);
  });
  return state.apiReady;
}

async function play(id, { push = true } = {}) {
  state.current = id;
  $('watch').hidden = false;
  if (push) history.pushState({}, '', `/?v=${id}`);
  await loadPlayerApi();
  if (state.player) state.player.loadVideoById(id);
  else {
    state.player = new YT.Player('player', {
      videoId: id,
      playerVars: { autoplay: 1, rel: 0, playsinline: 1 },
      events: { onStateChange: (e) => e.data === YT.PlayerState.ENDED && playNext() },
    });
  }
  $('open-yt').href = `https://www.youtube.com/watch?v=${id}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  try {
    const v = await api(`/api/video?id=${id}`);
    if (state.current !== id) return;
    document.title = `${v.title} – YTShare`;
    $('v-title').textContent = v.title;
    $('v-meta').textContent = [v.channel, fmtViews(v.views)].filter(Boolean).join(' · ');
    $('v-desc').textContent = v.description;
  } catch (e) { showError(e.message); }
}

function playNext() {
  const i = state.list.findIndex((v) => v.id === state.current);
  if (i >= 0 && state.list[i + 1]) play(state.list[i + 1].id);
}

// ---------- lists ----------
function render(items, append) {
  const ul = $('results');
  if (!append) ul.replaceChildren();
  for (const v of items) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = 'card';
    const img = Object.assign(document.createElement('img'), { src: v.thumbnail, alt: '', loading: 'lazy' });
    const d = document.createElement('div');
    const t = document.createElement('b'); t.textContent = v.title;
    const c = document.createElement('small'); c.textContent = v.channel;
    d.append(t, document.createElement('br'), c);
    b.append(img, d);
    b.onclick = () => play(v.id);
    li.append(b);
    ul.append(li);
  }
}

async function load({ query = '', more = false } = {}) {
  showError('');
  try {
    let data;
    if (query) {
      const tok = more && state.nextPageToken ? `&pageToken=${state.nextPageToken}` : '';
      data = await api(`/api/search?q=${encodeURIComponent(query)}${tok}`);
    } else data = await api('/api/trending');
    state.query = query;
    state.nextPageToken = data.nextPageToken || null;
    state.list = more ? state.list.concat(data.items) : data.items;
    $('list-title').textContent = query ? `Results for “${query}”` : 'Trending';
    $('more').hidden = !state.nextPageToken;
    render(data.items, more);
  } catch (e) { showError(e.message); }
}

// ---------- events ----------
$('search').onsubmit = (e) => {
  e.preventDefault();
  const q = $('q').value.trim();
  if (!q) return load();
  const id = extractId(q);
  if (id && /youtu/.test(q)) return play(id);
  load({ query: q });
};
$('more').onclick = () => load({ query: state.query, more: true });

$('share').onclick = async () => {
  const url = `${location.origin}/?v=${state.current}`;
  const title = $('v-title').textContent;
  try {
    if (navigator.share) await navigator.share({ title, url });
    else { await navigator.clipboard.writeText(url); toast('Link copied!'); }
  } catch (e) { if (e.name !== 'AbortError') toast(url); }
};

addEventListener('popstate', () => {
  const id = new URLSearchParams(location.search).get('v');
  if (id) play(id, { push: false });
  else { $('watch').hidden = true; state.player?.pauseVideo(); }
});

// ---------- boot ----------
load();
const initial = new URLSearchParams(location.search).get('v');
if (initial && extractId(initial)) play(extractId(initial), { push: false });
