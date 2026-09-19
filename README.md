# ArchVision AI — Intelligent House Design & 2D-to-3D Visualization

Describe your house requirements (plot size, budget, bedrooms, bathrooms, floors, style) —
or upload a photo/scan of an existing 2D floor plan — and get back an interactive 3D house,
a to-scale 2D floor plan, and an approximate construction cost. Like or dislike a design,
generate alternatives, edit it in plain English ("make the kitchen bigger," "add one more
bedroom," "give me a modern design"), and save/compare multiple options.

**This is a design-assistance and visualization tool, not a replacement for a licensed
architect or structural engineer.** Nothing it produces is construction-ready or
structurally verified — always get professional validation before building.

---

## Final workflow (as implemented)

```
USER
 └─ Enter plot + budget + requirements (Create New House Design)
     └─ Rule-based Design Engine generates a room layout          [designGenerator.js]
         └─ 2D Floor Plan Generator draws it to scale (SVG)        [floorPlan2D.js]
         └─ 3D Model Generator builds it in the browser (R3F)      [client/src/three/*]
         └─ Cost Estimator calculates an approximate budget        [costEstimator.js]
             └─ User reviews the design (3D / 2D / cost)
                 ├─ 👍 Like / 👎 Don't Like (per-version feedback)
                 ├─ 🔄 Generate Another Design (same requirements, different layout)
                 ├─ 💬 Natural-language modification ("make the living room bigger", …)
                 │     └─ AI interprets intent → deterministic engine applies it
                 │         → regenerates 2D + 3D + cost together
                 └─ Compare Designs (2–3 saved designs side by side)
                     └─ Save Final Design (My Designs)

Upload Existing 2D Plan
 └─ Gemini multimodal vision reads the image                       [server.js: /api/design]
     └─ Detects rooms, doors, windows, staircase → structured JSON [sanitizeLayout()]
         └─ 3D Model Generator builds it the same deterministic way
```

Every geometry-producing step is deterministic, hand-written code — **never** an LLM
directly emitting coordinates. Two places use an LLM (Google Gemini), and both are
explicitly boxed in:

- **Conversational edits** (`designModifier.js`): the LLM picks one action from a fixed
  8-item vocabulary (`resize_room`, `add_room`, `remove_room`, `more_open_space`,
  `move_staircase`, `reduce_cost`, `change_style`, `regenerate_variant`). `sanitizeIntent()`
  rejects anything outside that vocabulary before it's used. A deterministic function
  (`applyIntent()`) turns the intent into modified requirements, which go through the exact
  same generator as everything else. A keyword-based fallback parser covers the same intents
  when no API key is configured, so the feature works either way.
- **Upload analysis** (`server.js`, `buildImagePrompt()`): Gemini's vision model identifies
  *what* the rooms/doors/windows are and their approximate layout; `sanitizeLayout()`
  clamps/validates every field (unknown room types → `other`, out-of-range door offsets
  dropped, sizes floored) before any of it reaches the 3D engine.

---

## Review findings (bugs / security / geometry / UX) — fixed this pass

| # | Category | Finding | Fix |
|---|---|---|---|
| 1 | **Deployment bug (critical)** | `client`'s `vite build` output wasn't configured to land in `public/`, where `server.js` actually serves static files from. `public/` still held a **stale pre-React build** (referencing `viewer3d.js`, deleted early in development) — deploying today would have served a completely different, months-out-of-date app. | Set `build.outDir: '../public'` + `emptyOutDir: true` in `client/vite.config.js`, added a root `build` script, and ran a real build to replace the stale files. Verified `node server.js` now serves the current app. |
| 2 | **Invalid geometry / incorrect dimensions** | The room-subdivision algorithm guarantees no overlaps/gaps but has no *minimum size* — an extreme input (15×15ft plot, 8 bedrooms, 6 bathrooms, 3 floors) produced a bathroom **1.17ft wide**. Undetected by the existing validator (which only checked overlaps/bounds). | Added a minimum-room-dimension check in `generateHouseDesign()` (throws a clear, actionable 422 instead of silently returning it) and a matching check in `floorPlan2D.js`'s `validateDesignGeometry` (defense-in-depth for AI/upload-derived designs too). |
| 3 | **Budget calculation bug** | "Reduce the cost" fed its scale factor into room *weights*, but `subdivide()` always exactly tiles whatever rectangle it's given regardless of relative weights — scaling all weights uniformly cancels out and changes nothing. Verified: cost was **byte-identical** after 10 repeated "reduce the cost" requests. | Moved the scale to shrink the actual buildable footprint in `planSite()` instead of room weights. Verified: one request now reduces cost ~12%; 10 compounded (clamped) requests take a ₹40L design to ₹22L. |
| 4 | **Security — unauthenticated file upload** | `multer` accepted any file up to 15MB with no server-side type check; the `accept="image/*,.pdf"` on the `<input>` is a client-side hint only. | Added a `fileFilter` rejecting anything that isn't image/PDF (415), plus a global JSON error handler so multer's rejection returns clean JSON instead of an HTML stack trace. |
| 5 | **Security — no rate limiting on AI routes** | `/api/design`, `/api/design/modify`, `/api/design/chat-modify` all call the Gemini API (real quota/cost per call) with no throttling — a retry loop or casual abuse could burn through quota. | Added a simple in-memory per-IP limiter (12 requests/minute) on all three AI-calling routes. Verified: 12th request in a minute returns 429. (Single-instance only — see Future Improvements.) |
| 6 | **Security — IDOR on `GET /api/designs/:id`** | Every other design route scopes by `clientId`; this one didn't, so anyone who obtained a design id (e.g. a copy-pasted link) could read another client's saved design. Not currently called by the frontend, but live and reachable. | Added the same `clientId` ownership check the list/delete routes already use. |
| 7 | **Poor UX** | Loading a design saved from an uploaded-plan analysis into the editor exposed "Generate Another Design" and the AI chat panel — both call the rule-based engine, which needs `plotWidthFt`/`plotDepthFt` that an uploaded design never has, producing a confusing "Provide plotWidthFt and plotDepthFt" error. Same for the 2D floor-plan tab (built around the rule-based `plot` shape). | Gated all three behind an `isRuleBased` check in `CreateDesign.jsx`; an uploaded design now shows a plain-English note explaining why, instead of a cryptic API error. |
| 8 | **Feature gap** | "Upload Existing 2D Plan" was UI-only — captured the file and showed a static "not connected" notice; never actually called the existing (already-built) Gemini vision endpoint. | Wired it up: analyze → loading state → 3D viewer + room legend + cost panel + Save, or a clear error/not-configured notice. (Scope note: shows 3D + cost, not the 2D SVG plan — see Future Improvements.) |

Everything above was verified directly (backend request/response tests plus live browser
interaction), not just reasoned about. Also spot-checked and found **no issues**: SQL is
fully parameterized (no injection risk), AI-derived text is rendered as React text content
(no XSS), `.env`/`data/` are correctly gitignored, and CORS is scoped to the dev client
origin only.

Things noted but **not** changed (by design, or out of reasonable scope for this pass —
see Future Improvements): no real user accounts (already disclosed in the UI), the 1MB+
JS bundle (Three.js/R3F; would need code-splitting), and the two independent cost-estimator
code paths (`estimateCostFromSqft` for generated designs, `estimateDetailedCost` for the
standalone Cost Estimator page) — intentionally separate, documented in `costEstimator.js`.

---

## 1. Final folder structure

```
AI-Powered Intelligent House Design and 2D-to-3D Visualization System/
├── server.js                # Express app — all API routes
├── designGenerator.js       # Rule-based layout engine (rooms/doors/windows/stairs)
├── designModifier.js        # Conversational-edit intent → deterministic requirements changes
├── floorPlan2D.js           # Structured design → 2D SVG drawing model + geometry validator
├── costEstimator.js         # Deterministic cost formulas (2 independent code paths — see below)
├── store.js                 # Saved-designs storage (Postgres if DATABASE_URL, else local JSON)
├── package.json             # Root scripts: start / dev / build / postinstall
├── .env.example             # Documented env vars (copy to .env)
├── data/
│   └── designs.json         # Local-file datastore (dev only; gitignored)
├── public/                  # Built client — OUTPUT of `npm run build`, do not hand-edit
│   ├── index.html
│   └── assets/
└── client/                  # React + Vite source (the actual frontend to edit)
    ├── index.html
    ├── vite.config.js       # build.outDir points at ../public
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx                    # View router + top-level state (designs, clientId)
        ├── index.css                  # Whole design system ("Blueprint Studio" theme)
        ├── components/
        │   ├── Sidebar.jsx
        │   ├── HouseViewer3D.jsx      # R3F <Canvas> wrapper — imperative view/camera API
        │   ├── FloorPlan2D.jsx        # 2D SVG renderer (rule-based designs only)
        │   ├── CostPanel.jsx
        │   ├── RoomLegend.jsx
        │   └── NotConnectedNotice.jsx
        ├── pages/
        │   ├── Home.jsx               # Landing page + sample gallery
        │   ├── CreateDesign.jsx       # Requirements form, result panel, chat, versions
        │   ├── UploadPlan.jsx         # Upload → vision analysis → 3D result
        │   ├── MyDesigns.jsx          # Saved designs, compare-selection, delete
        │   ├── CompareDesigns.jsx     # 2–3 saved designs side by side
        │   └── CostEstimator.jsx      # Standalone cost calculator (no design needed)
        ├── three/
        │   ├── houseModel.js          # 2D layout JSON -> framework-agnostic 3D scene data
        │   ├── HouseScene.jsx         # Declarative JSX mapping of that data to meshes
        │   ├── SceneController.jsx    # Camera presets + first-person walkthrough (imperative)
        │   ├── Walls.jsx / Roof.jsx / Furniture.jsx / Label.jsx
        │   └── roofGeometry.js        # Hand-built hip-roof BufferGeometry
        ├── lib/
        │   ├── api.js                 # All fetch() wrappers to the backend
        │   ├── layout.js              # Layout-shape-agnostic helpers (area/rooms/floors)
        │   ├── clientId.js            # Browser-generated pseudo-identity
        │   ├── config.js              # API_BASE (dev vs prod)
        │   └── format.js              # fmtINR()
        └── data/
            └── samples.js              # 4 hand-authored sample layouts (no backend needed)
```

## 2. Database schema

Two interchangeable backends behind one interface (`store.js`), selected automatically by
whether `DATABASE_URL` is set:

**PostgreSQL** (production — persists across redeploys):

```sql
CREATE TABLE IF NOT EXISTS designs (
  id          TEXT PRIMARY KEY,        -- 'd_' + base36 timestamp + random suffix
  client_id   TEXT NOT NULL,           -- browser-generated pseudo-identity (no auth)
  title       TEXT,
  layout      JSONB NOT NULL,          -- the full design JSON (rooms/doors/windows/stairs/plot)
  cost        JSONB,                   -- the cost-estimate JSON, or null
  requirements JSONB,                  -- original form inputs, or null for an uploaded design
  parent_id   TEXT,                    -- reserved for future version-lineage tracking (unused today)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS designs_client_id_idx ON designs (client_id);
```

**Local JSON file** (dev — zero setup): `data/designs.json` holds a flat array of the same
shape, camelCased (`clientId`, `parentId`, `createdAt`), read/written wholesale on every
request. Fine for a demo; not for concurrent multi-instance use.

There is currently no `users` table — `client_id` is a random string generated once in
`localStorage` (`client/src/lib/clientId.js`), not a real account. See Future Improvements.

## 3. API documentation

All routes return JSON. Errors: `{ "error": "message" }` with an appropriate status code
(400 bad input, 404 not found, 415 bad file type, 422 invalid/unbuildable geometry, 429 rate
limited, 500 unexpected, 502/503 upstream AI issue).

| Method & Path | Body | Response | Notes |
|---|---|---|---|
| `GET /api/health` | — | `{ ok, configured, model, storage }` | `configured` = whether `GEMINI_API_KEY` is set |
| `POST /api/design/generate` | `{ plotWidthFt, plotDepthFt, budget?, bedrooms?, bathrooms?, floors?, parking?, garden?, style?, kitchenType?, livingRoomSize?, variationSeed?, roomSizeOverrides?, staircaseSideOverride?, sizeScale?, openSpaceScale? }` | Full design JSON (`title, summary, plot, floors, rooms, doors, windows, stairs, parking, estimated_cost, style, variationSeed`) | **Deterministic, no AI.** The `*Override`/`*Scale` fields are normally set by chat-modify, not typed by hand. |
| `POST /api/design/chat-modify` | `{ message: string, requirements: <same shape as above> }` | `{ intent, usedAI, changed, message, layout, cost, requirements }` | AI (or heuristic fallback) → sanitized intent → deterministic requirements change → re-run of `/api/design/generate`'s engine. Rate-limited. |
| `POST /api/design/floorplan` | `{ design: <a generated design JSON> }` | `{ floorPlans: [...] }` (one per floor) | Pure geometry, no AI. Validates first; 422 with `details[]` on invalid input. Rule-based designs only (needs `design.plot`). |
| `POST /api/cost/estimate` | `{ builtUpAreaSqft, floors, bedrooms, houseType, finishQuality, budget? }` | Detailed cost breakdown (9 categories) | Standalone — no design/layout needed. Deterministic. |
| `POST /api/design` | `multipart/form-data` (`floorplan` file) **or** JSON `{ requirements }` / `{ description, bedrooms?, areaSqm?, style? }` | `{ layout, cost }` (meters-based layout shape) | Calls Gemini (vision for a file, text otherwise). 503 if `GEMINI_API_KEY` unset. Rate-limited. File: image or PDF, ≤15MB. |
| `POST /api/design/modify` | `{ layout, instruction, requirements? }` | `{ layout, cost }` | Free-text edit of an AI-generated (meters-based) layout via Gemini. 503 if unconfigured. Rate-limited. |
| `POST /api/designs/save` | `{ clientId, layout, cost?, requirements?, parentId?, title? }` | `{ design: <saved record> }` | |
| `GET /api/designs?clientId=…` | — | `{ designs: [...] }` | |
| `GET /api/designs/:id?clientId=…` | — | `{ design }` | 404 if the id doesn't belong to that `clientId`. |
| `DELETE /api/designs/:id?clientId=…` | — | `{ ok: true }` | 404 if the id doesn't belong to that `clientId`. |

## 4. Environment variables

Set in `.env` (copy from `.env.example`; never committed — already gitignored):

| Variable | Required? | Default | Purpose |
|---|---|---|---|
| `GEMINI_API_KEY` | No | — | Enables upload analysis, free-text AI generation/modify, and AI-quality chat-edit interpretation. Get one free at https://aistudio.google.com/apikey. Comma-separate multiple keys to rotate across free-tier quotas. Without it, the rule-based generator, cost estimator, and chat-modify (via its heuristic fallback) all still work. |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Primary model; a fixed fallback chain (`gemini-2.5-flash-lite`, `gemini-2.0-flash`, `gemini-2.0-flash-lite`) is tried automatically if it's overloaded/rate-limited. |
| `PORT` | No | `3000` | Express listen port. |
| `DATABASE_URL` | No | — | Postgres connection string. Set this in production so saved designs survive redeploys; omit for local dev (falls back to `data/designs.json`). |
| `DATA_DIR` | No | `./data` | Where the local-file store writes `designs.json`, if `DATABASE_URL` isn't set. |

## 5. Installation instructions

```bash
git clone <this-repo>
cd "AI-Powered Intelligent House Design and 2D-to-3D Visualization System"
npm install              # installs server deps AND client deps (postinstall hook)
cp .env.example .env     # then optionally add GEMINI_API_KEY — everything else works without it
```

Requires Node.js 18+.

## 6. Run instructions

**Development** (two servers, hot-reload on both):

```bash
npm run dev              # terminal 1 — Express API on :3000
cd client && npm run dev # terminal 2 — Vite dev server on :5173 (proxies API calls to :3000)
```

Open http://localhost:5173.

**Production** (one server, serves the built client + API from the same origin/port):

```bash
npm run build            # builds client/ -> public/
npm start                # serves public/ + the API on :3000
```

Open http://localhost:3000.

## 7. Testing strategy

There is **no automated test suite in this repository today** — everything so far has been
verified through direct backend request/response scripts and live browser interaction during
development, not a checked-in, repeatable suite. That's a real gap; here's the pragmatic plan
for closing it, given how the code is actually structured:

**Unit tests (highest value, easiest to add)** — `designGenerator.js`, `designModifier.js`,
`floorPlan2D.js`, and `costEstimator.js` are pure functions with no I/O and no AI dependency.
Use Node's built-in `node:test` + `assert` (zero new dependencies) or Jest:
- `generateHouseDesign()`: for a range of plot sizes/bedroom/bathroom/floor counts, assert
  zero room overlaps, every room within plot bounds, every room ≥ the minimum dimension, total
  room area ≈ buildable area (tiling correctness), and that every `variationSeed` 0–3 (and
  their repeats) produce genuinely different room orderings.
- `designModifier.js`: `sanitizeIntent()` should reject every value outside its vocabulary
  (fuzz with random garbage objects); `applyIntent()` should be idempotent-safe under repeated
  application (clamping never produces `NaN`/negative/zero multipliers).
- `floorPlan2D.js`: `validateDesignGeometry()` should flag a deliberately-corrupted design
  (manually shrink a room, overlap two rooms, move one out of bounds) and pass a valid one.
- `costEstimator.js`: breakdown percentages sum to 100, breakdown amounts sum exactly to
  `totalCost`, budget-exceeded/within-budget/no-budget branches all correct.

**Integration tests** — spin up `server.js` (e.g. with `supertest`) and hit each route in
§3: valid input → expected shape; invalid input → correct status code. Mock the Gemini `fetch`
call (module-level injection or `nock`) so `/api/design`, `/api/design/modify`, and the AI
branch of `/api/design/chat-modify` are testable without a real API key or network access —
the heuristic-fallback branch of chat-modify needs no mocking at all.

**Frontend** — component tests (React Testing Library) for the deterministic UI logic
(version history navigation, feedback toggling, form validation, chat log rendering). The 3D
viewer is the hard part to automate: this session's own development repeatedly hit a
sandboxed-browser-only issue where `requestAnimationFrame`/`ResizeObserver` don't fire when
the preview pane is hidden, which is invisible to real users but blocks R3F's normal render
loop in automated testing here. A real CI browser (headed Chrome via Playwright, not a hidden
headless context) shouldn't hit this; verify that assumption before relying on it.

**Manual QA checklist** (until the above exists) — one pass per PR touching geometry:
1. Generate a design (small plot, large plot, 1/2/3 floors, min/max bedrooms).
2. Confirm 2D plan has no visibly overlapping rooms/doors and dimensions look plausible.
3. Confirm 3D view: rotate/pan/zoom, all 4 camera presets, floor isolation, walkthrough
   enter/exit, roof/wireframe toggles.
4. Click "Generate Another Design" 3×, confirm each version is visibly different and
   navigable via Prev/Next.
5. Try each of the 9 example chat phrases from the product spec; confirm the design visibly
   changes and the cost stays plausible.
6. Save a design, reload the page, confirm it's still in My Designs; compare 2 designs.
7. Upload a non-image file — confirm a clean 415 error, not a crash.

## 8. Sample test data

Minimal valid request for `POST /api/design/generate` (also a good smoke-test payload):

```json
{ "plotWidthFt": 30, "plotDepthFt": 40, "bedrooms": 3, "bathrooms": 2, "floors": 2,
  "parking": true, "garden": true, "style": "Modern" }
```

A larger, budget-constrained example:

```json
{ "plotWidthFt": 45, "plotDepthFt": 60, "bedrooms": 5, "bathrooms": 4, "floors": 3,
  "budget": 6000000, "style": "Farmhouse", "livingRoomSize": "Large / open-plan" }
```

Edge cases worth keeping in a fixture file (all confirmed handled correctly this pass):

```json
// Minimum plot — should still succeed (single floor, modest room counts)
{ "plotWidthFt": 15, "plotDepthFt": 15, "bedrooms": 1, "bathrooms": 1, "floors": 1 }

// Deliberately too many rooms for the plot — should now return 422, not garbage geometry
{ "plotWidthFt": 15, "plotDepthFt": 15, "bedrooms": 8, "bathrooms": 6, "floors": 3,
  "parking": true, "garden": true }
```

Chat-modify sample (pair with any `requirements` object returned by `/api/design/generate`):

```json
{ "message": "make the master bedroom larger", "requirements": { "plotWidthFt": 30, "plotDepthFt": 40, "bedrooms": 3, "bathrooms": 2, "floors": 2 } }
```

All 9 example phrases from the product spec ("make the living room bigger", "add one more
bedroom", "give me more open space", "move the staircase", "make the kitchen bigger",
"reduce the cost", "give me a modern design", "create another design", "make the master
bedroom larger") were run sequentially against a live instance during this review and each
produced the expected, distinct change.

## 9. Deployment instructions

Any single Node host works (Render, Railway, Fly.io, a VPS):

1. Set environment variables (§4) — at minimum none are *required*; set `GEMINI_API_KEY` and
   `DATABASE_URL` for full functionality and persistence.
2. Build command: `npm run build` (installs client deps + builds React into `public/`).
3. Start command: `npm start`.
4. **Persistence**: without `DATABASE_URL`, saved designs live in `data/designs.json` on
   local disk — most platforms (Render free tier included) wipe this on every redeploy or
   restart. Provision a Postgres instance (Render/Neon/Supabase all have free tiers) and set
   `DATABASE_URL`; the `designs` table is created automatically on first boot.
5. No separate static-hosting step needed — `server.js` serves the built client and the API
   from the same origin, so there's no CORS configuration to manage in production (the CORS
   allowance in `server.js` is dev-only, scoped to `http://localhost:5173`).

## 10. Future improvements

Roughly in order of impact:

- **Real user accounts.** The current `clientId` is a `localStorage` string anyone can clear
  or spoof — fine for a demo, not for real multi-user use. Swap in real auth (e.g. a
  session/JWT layer) and scope `designs` by an actual user id.
- **2D floor plan for uploaded designs.** `floorPlan2D.js` is built around the rule-based
  generator's feet-based `plot`/wall-network shape; extending it (or writing a second,
  smaller renderer) to also handle the AI-vision path's meters-based shape would give upload
  users the same 2D view rule-based users get.
- **Automated test suite.** See §7 — the unit-test layer alone (no AI mocking needed) would
  catch regressions in the highest-risk code (geometry, cost math) cheaply.
- **Shared-store rate limiting.** The current limiter is in-memory per-process; a
  multi-instance deployment needs a shared store (Redis, or the Postgres table already in
  use) for the limit to actually hold across instances.
- **Bundle size.** The production JS bundle is ~1.1MB minified (Three.js + React Three
  Fiber + drei). Route-based code-splitting (lazy-load the 3D viewer only when a design
  exists to show) would meaningfully cut initial load time.
- **Diff-based chat edits.** Each conversational edit currently regenerates the whole layout
  from scratch via the same deterministic engine; a more surgical "move just this wall"
  primitive would allow finer edits without ever risking a full re-layout the user didn't ask
  for.
- **Multi-page PDF upload.** A multi-floor PDF today needs each floor uploaded and analyzed
  separately; native multi-page handling would remove that friction.
- **Export.** glTF/OBJ export of the 3D model, or a recorded walkthrough video/GIF.
- **`parent_id` lineage.** The database column already exists (§2) but nothing writes to it
  yet — wiring it up would let "Generate Another"/chat-edit versions show their actual
  derivation tree, not just a flat save list.

## Credits

Textures, fonts, libraries and services are credited with their licenses in [CREDITS.md](CREDITS.md).
