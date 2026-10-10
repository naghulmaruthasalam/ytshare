# YTShare

Search YouTube, watch in the official embedded player, and share links (`/?v=VIDEO_ID`).
The YouTube Data API key lives only in the server's `.env` — it is never sent to the browser.

## 1. Get a YouTube Data API key

1. Go to <https://console.cloud.google.com/> and sign in.
2. **Create a project** (top bar → project picker → *New Project*), e.g. `ytshare`.
3. **Enable the API:** *APIs & Services → Library* → search **YouTube Data API v3** → **Enable**.
4. **Create the key:** *APIs & Services → Credentials → Create credentials → API key*.
5. **Restrict it** (important, since you'll share the app): click the key →
   - *API restrictions* → **Restrict key** → select **YouTube Data API v3**.
   - *Application restrictions* → **IP addresses** → add your server's IP (once deployed).
6. Copy the key.

Free quota is 10,000 units/day. A search costs 100 units (≈100 searches/day); video lookups and
trending cost 1. Results are cached for 10 minutes to stretch this.

## 2. Run locally

```bash
cp .env.example .env     # then paste your key into YOUTUBE_API_KEY=
npm start                # http://localhost:3000
```

No dependencies to install (Node 18+).

## 3. Share it

Deploy anywhere that runs Node (Render, Railway, Fly.io, a VPS…). Set `YOUTUBE_API_KEY`
as an environment variable on the host (don't commit `.env`), start command `npm start`.
For a quick temporary share from your machine: `npx localtunnel --port 3000` or `cloudflared tunnel --url http://localhost:3000`.

## About YouTube Premium

Premium is tied to each viewer's own Google account and cannot be passed through an API key
or shared via the app. The embedded player is YouTube's own, so:

- **You** (signed in to your Premium account in your browser) get ad-free playback inside this app.
- **People you share with** get normal playback with ads unless they have their own Premium.
- Background play / downloads are Premium features of the YouTube apps and are not available in embeds.

Extracting streams server-side (e.g. yt-dlp) to re-serve your Premium access to others violates
YouTube's Terms of Service and the account-sharing rules, so this app deliberately doesn't do it.
Some videos disable embedding; the search is filtered to embeddable videos, and the player
offers an "Open on YouTube" link as a fallback.
