# Node.js 24 operation and validation

Prepared 14 November 2026, from repository commit
`0d05d4046d6cbdcd2504bac8af3c8354fd9513fd`.

## Runtime and dependencies

App Engine and the example configuration use `nodejs24`; `.nvmrc` and
`package.json` select Node.js 24. Google lists support until 30 April 2028.
Node.js 24 uses Ubuntu 24.04 on App Engine, rather than Node.js 20's Ubuntu 22.04.
See [Google's schedule](https://docs.cloud.google.com/appengine/docs/standard/lifecycle/support-schedule).

| Dependency | Previous lock | New lock |
| --- | --- | --- |
| Express | 4.22.1 | 4.22.3 |
| Socket.IO server | 4.8.3 | 4.8.4 |
| OpenAI | 4.104.0 | 4.104.0 |
| cors | 2.8.5 | 2.8.6 |
| dotenv | 16.3.1 | 16.6.1 |

The browser CDN and development test client use Socket.IO 4.8.4. The OpenAI
SDK remains on major 4 with existing Chat Completions calls to `gpt-4o-mini`.
No Express 5 or SDK major migration is included. The original audit reported
eight vulnerable production package entries; the refreshed full and production
lockfile audits reported zero. Audits are snapshots, not complete security audits.

Root ESM imports and checked first-party APIs did not require a Node.js 24
rewrite. No native installation script/platform restriction was found in the
reviewed root production lockfile. Node.js 24's TLS/OpenSSL changes still need
real-cloud validation; a local HTTP mock cannot prove managed TLS behavior.
See [Node's migration notes](https://nodejs.org/en/blog/migrations/v22-to-v24).
The separate `Sisyphus/package.json` is not used by the root API deployment.

## Local validation

```bash
nvm install
nvm use
npm ci --engine-strict
npm run check
npm test
npm audit --omit=dev --audit-level=high
```

Tests exercise the actual HTTP server and SDK with a local fake AI upstream;
they do not make paid calls. Coverage includes health/CORS, both AI routes,
malformed requests/responses, upstream failures, and square/hex multiplayer
across polling and WebSockets. They also run the deployment smoke script
against the local fake upstream.

Malformed `poemSoFar` input previously caused an uncaught rejection before the
handler's try/catch and terminated Node. Requests now validate array/string
shape, bounds and line number before use, returning 400 without invoking the
SDK. AI phrase results require three nonempty strings. Poem themes reject
empty/oversized values. Root health now includes the Node version and
`GAE_VERSION`, allowing deployment checks to identify the served revision.

## Deployment pipeline

Deployment was authorized after the initial patch-only review. The original
repository's main-branch deployment behavior is retained with additional gates:

1. Pushes/PRs run a clean install, syntax checks, tests and production audit.
2. After successful validation, main pushes/manual runs authenticate using the
   existing `GCP_SA_KEY` secret. PRs never deploy or receive deployment secrets.
3. Save the current traffic allocation. Deploy a unique Node.js 24 candidate
   with `promote: false`, using the existing `OPENAI_API_KEY` secret.
4. Confirm its cloud runtime and exercise health/CORS, malformed-input handling,
   two live AI calls, and square/hex multiplayer over polling.
5. Verify traffic was not changed by another operation, then promote the
   tested version. Recheck the production endpoint's version and multiplayer.
6. Restore the saved traffic allocation if promotion or production verification
   fails. Preserve previous versions for rollback; do not delete them during
   the rollout.

`RUN_AI=1` makes two paid requests in `scripts/smoke-live.js`; omit it or use `0`
to skip AI calls. `BASE_URL` selects the target and `EXPECTED_VERSION` rejects
responses from a different version. The script never receives the API key.
The candidate receives live requests through its version-specific URL while
production stays on the previous allocation. The workflow has no PR deployment
and serializes deployment runs. The environment variable input is a replacement,
not a merge; account for any additional manually managed variables before future
changes. [Deployment action documentation](https://github.com/google-github-actions/deploy-appengine).

```bash
BASE_URL=https://YOUR-CANDIDATE-URL EXPECTED_VERSION=YOUR-VERSION RUN_AI=1 \
  node scripts/smoke-live.js
```

## Website checks

The API root returns JSON; it does not serve the HTML frontend. The frontend is
published separately by GitHub Pages. Check `https://ignasz.uk` and the Caesar
Poem, Sisyphus, Probability and Game of Life pages after the Pages deployment.
Verify images/video/PDF links, console/network errors, mobile layout and game
controls. Generate a poem, exercise guessing/reset, and advance the Sisyphus
choices. In two browsers/devices, create/join a room and verify synchronized
moves, readiness, simulation and disconnect handling. Also check continuous
placement, reinforcement windows, finite/endless matches and long sessions.

The three interactive clients hard-code the production API hostname outside
local-host checks. A preview must explicitly point **all three** client files
(`caesar-poem/script.js`, `Sisyphus/game.js`, `game-of-life/main.js`) at its intended
backend, using an allowed origin. Otherwise preview actions can hit production.
Do not broaden production CORS to `*` for testing. Automated HTTP/Socket.IO smoke
checks do not replace visual and long-session checks.

## Remaining operational limitations

- Rooms and simulation coordinators are in-memory Maps. Automatic scaling or
  restarts can lose a room or route players to different instances. A broadcast
  adapter alone does not persist the custom game state. This upgrade preserves
  the existing scaling configuration; do not interpret a short smoke test as
  proof of cross-instance reliability.
- App Engine Standard does not support WebSockets. Polling is tested for the
  cloud rollout; local WebSocket success alone is insufficient. See
  [Google's environment comparison](https://docs.cloud.google.com/appengine/docs/the-appengine-environments)
  and [Socket.IO scaling](https://socket.io/docs/v4/using-multiple-nodes/).
- The server still needs broader Socket.IO input validation, request abuse/rate
  protection, and deliberate retry/timeout policies. CORS is not authentication.
  Long-session recovery is not implemented: disconnecting removes the room.
- Monitor F1 memory/CPU, 5xx, AI latency/quota and polling disconnects. Node 22+
  changed stream buffering and Node 24 changed TLS defaults; workload behavior
  matters beyond installation compatibility.
- Old `node_modules` files are tracked in Git despite `.gitignore`. `npm ci`
  replaces them and `.gcloudignore` excludes them from uploads. Do not stage
  those generated changes; remove tracked dependencies in a separate cleanup.
- Retained candidate versions with `min_idle_instances: 1` can incur cost.
  Clean up only once the rollout is verified and the rollback window is over.
