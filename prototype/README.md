# Fun-o-Meter prototype

Standalone React + TypeScript + Tailwind prototype of the attendee join flow, to be ported to Drupal Canvas code components.

```bash
pnpm install
pnpm dev
```

Stub room code: `NED-4261`.

## Using the real Drupal site

By default the prototype uses a stub API. To use the `fun_room` module on the
local Drupal site instead, set `VITE_ROOM_API` to the site origin:

```bash
VITE_ROOM_API=https://fun-canvas-code.ddev.site pnpm dev
```

The prototype only covers the join flow, so unlike the Canvas component it does
not redirect to a room page after joining. The site must have the module
enabled, a room created, and CORS allowed for localhost. Those steps are in
[`site/web/modules/custom/fun_room/README.md`](../site/web/modules/custom/fun_room/README.md).

## Port rules

- One default-exported component per file in `src/components/`, configured by props.
- All network calls live in `src/api.ts`. The Canvas version is `fun-canvas-project/src/lib/fun-room-api.ts`, which takes the client from `useJsonApiClient()`; keep the two in step.
- Tailwind utilities only; design tokens are in `src/index.css`.
- No router, no global state, no extra dependencies.
