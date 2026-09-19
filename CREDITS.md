# Credits & Licenses

ArchVision AI is built on open-source software and freely licensed assets. Everything
below is used within its license terms.

## Textures and lighting (Poly Haven, CC0)

Photo-scanned PBR textures (diffuse / normal / roughness maps) from
[Poly Haven](https://polyhaven.com), released under **CC0 1.0 (public domain)** — no
attribution is required; it is given here as a courtesy. Files live in
`client/public/textures/<folder>/`.

| Folder | Used for | Poly Haven asset |
|---|---|---|
| `brick` | Brick walls, chimney | `red_brick_03` |
| `stone` | Wall base, porch step, gate pillars | `stone_wall_03` |
| `plaster` | Interior walls, garden wall | `white_plaster_02` |
| `concrete` | Foundation slab, flat roof deck | `grey_plaster_02` |
| `bark` | Tree and palm trunks | `palm_tree_bark` |
| `exterior-wall`, `fabric`, `grass`, `marble`, `paving`, `roof`, `tile`, `wood` | Stucco walls, upholstery, lawn, counters, paving, shingles, floors | Poly Haven CC0 sets (the exact asset names of these eight were not recorded when they were downloaded) |

Environment lighting uses the HDRI presets built into `@react-three/drei`, which are
Poly Haven CC0 HDRIs (loaded at runtime from the drei preset CDN; skipped on phones).

## Fonts

- **Manrope** and **Inter** via Google Fonts — SIL Open Font License 1.1.

## Open-source libraries

| Library | License |
|---|---|
| React, React DOM | MIT |
| Three.js | MIT |
| @react-three/fiber, @react-three/drei, @react-three/postprocessing, postprocessing | MIT |
| Framer Motion | MIT |
| lucide-react (icons) | ISC |
| Vite, @vitejs/plugin-react | MIT |
| Express, multer, node-postgres (`pg`) | MIT |

## Services

- **Google Gemini API** — optional AI floor-plan reading and chat edits (runtime service, free tier).
- **Brevo / Resend** — transactional email for login codes and enquiries.
- **Render** (hosting) and **Neon** (Postgres database).

## Original work and AI assistance

The application code — the rule-based house generator, cost estimator, 3D scene
construction, builder marketplace, messaging and email-OTP login — was written for this
project. It was developed with the help of an AI coding assistant (Claude by Anthropic),
under the author's direction and review. No code was copied from another project; the
third-party components are the libraries and assets listed above.

This is a design-assistance and visualization tool, not a substitute for a licensed
architect or structural engineer.
