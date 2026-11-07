# Fun-o-Meter prototype

Standalone React + TypeScript + Tailwind prototype of the attendee join flow, to be ported to Drupal Canvas code components.

```bash
pnpm install
pnpm dev
```

Stub room code: `NED-4261`.

## Port rules

- One default-exported component per file in `src/components/`, configured by props.
- All network calls live in `src/api.ts` (swap for Drupal endpoints when porting).
- Tailwind utilities only; design tokens are in `src/index.css`.
- No router, no global state, no extra dependencies.
