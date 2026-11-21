<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/ea5b89b4-e4d3-4ca0-9dab-e55911e1d609

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Online duels

Run `npm run online` in a second terminal. Open the Vite URL in two tabs and choose **Play Online** on both to pair locally. Guest matchmaking uses the existing physics on the server and keeps its queue and matches in memory.

For an Android build, set `VITE_ONLINE_SERVER_URL` to the HTTPS origin of the multiplayer server. Use `.env.android-debug` for Android debug or `.env.production` for Android release. The server listens on loopback by default. For a hosted server, set `HOST`, `PORT`, and, for any separate web frontend origins, `ONLINE_ALLOWED_ORIGINS` (comma separated, including `https://localhost` for the Capacitor Android app). The server can also serve the built web app from `dist`.

For public Android matchmaking, the `render.yaml` Blueprint deploys the root `Dockerfile` on Render's Free plan with HTTPS and a `/healthz` health check. Keep a single replica while the queue and matches live in memory. Free services can sleep when idle, and a server restart clears active sessions. Use the resulting HTTPS URL as `VITE_ONLINE_SERVER_URL` before building the Android app.

On a fresh clone, run `npm run build` and `npx cap sync android` after installing dependencies to generate the local Capacitor files before running Gradle.
