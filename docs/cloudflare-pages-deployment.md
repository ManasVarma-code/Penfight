# Cloudflare Pages Deployment & Multiplayer Backend Guide

This guide details how to deploy **Pen Fight Aura Wars** as a high-performance web game on **Cloudflare Pages** while connecting to your existing **Render multiplayer backend**.

---

## 1. Cloudflare Pages Project Configuration

1. In the **Cloudflare Dashboard**, navigate to **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**.
2. Select your repository and target the web release branch (`feature/cloudflare-pages-web`).
3. Set the following build settings:
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `/`
4. In **Environment variables**, set:
   - `NODE_VERSION`: `20` or `22`
   - `VITE_ONLINE_SERVER_URL`: `https://your-backend.onrender.com` (your hosted Render backend HTTPS origin, without trailing slash)

---

## 2. Multiplayer Backend (Render) CORS Configuration

Browser security blocks cross-origin `fetch` requests unless explicitly permitted by the server's CORS headers.

The backend server in [server/index.ts](file:///c:/Users/Manas/OneDrive/Documents/pen%20fight/server/index.ts) reads allowed origins from `ONLINE_ALLOWED_ORIGINS`:

1. In your **Render Dashboard** for the multiplayer service, navigate to **Environment**.
2. Update `ONLINE_ALLOWED_ORIGINS` to include your Cloudflare Pages domain:
   ```env
   ONLINE_ALLOWED_ORIGINS="https://your-subdomain.pages.dev,http://localhost:3000,http://localhost:3001"
   ```
   *(If you connect a custom domain like `https://penfightgame.com`, add that as well separated by comma).*
3. Deploy/restart the Render service.

---

## 3. Google AdSense Web Display Ads (Optional)

Web display ads are **disabled by default** to prevent empty ad boxes or layout distortion.

When you are ready to monetize the web release:
1. In Cloudflare Pages -> **Settings** -> **Environment variables**, configure:
   ```env
   VITE_ADSENSE_ENABLED="true"
   VITE_ADSENSE_CLIENT_ID="ca-pub-XXXXXXXXXXXXXXXX"
   VITE_ADSENSE_SLOT_DESKTOP_LEFT="0123456789"
   VITE_ADSENSE_SLOT_DESKTOP_RIGHT="0123456789"
   ```
2. Re-deploy the Pages project.
3. On desktop browsers ($\ge$ 1280px), vertical skyscraper display units will appear in the left and right gutters outside the active 460px gameplay arena. Active gameplay, flicking mechanics, and mobile screens are completely unaffected.

---

## 4. Google Sign-In for Web Ranked Mode

On Android, sign-in uses the native `RankedBrowserPlugin` Custom Tab.
In web browsers, sign-in uses the web fallback already integrated into `RankedViews.tsx`:
1. The user clicks **Sign in with Google**.
2. A new browser tab opens the backend Google sign-in endpoint (`/api/online/auth/google/start/:launch`).
3. The game tab polls the backend `/api/online/auth/google/check` endpoint.
4. Once authentication finishes in the popup tab, the game tab automatically receives the session token and switches to the authenticated profile.

Ensure your Google Cloud Console OAuth 2.0 Client credentials list the Render backend callback as an authorized redirect URI:
```
https://your-backend.onrender.com/api/online/auth/google/callback
```
