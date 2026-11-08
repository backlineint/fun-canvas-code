# Fun With Canvas Code Components: slide deck

A Reveal.js deck (Vite, Preact, Tailwind). While you present, it tells the
Drupal site which slide is showing, and every attendee's room page follows within
a couple of seconds.

```bash
pnpm install
pnpm dev
```

By default the deck uses a simulated room and just logs slide changes to the
console, so it works offline.

## Updating the room's slide

1. Set the presenter key on the site (see "Presenter endpoint" in
   [`site/web/modules/custom/fun_room/README.md`](../site/web/modules/custom/fun_room/README.md)).
2. Copy `.env.example` to `.env.local` and fill it in:

   | Variable | Meaning |
   |---|---|
   | `VITE_ROOM_API` | The Drupal site's origin, for example `https://fun-canvas-code.ddev.site` |
   | `VITE_ROOM_CODE` | The room to update, for example `NED-4261` |
   | `VITE_PRESENTER_KEY` | The shared key; must match the site's `FUN_ROOM_PRESENTER_KEY` |

3. Run `pnpm dev`. To drive a different room for one session, open the deck with
   `?room=DEMO-1` in the URL.

`.env.local` is ignored by git. **The key is baked into the dev bundle, so run the
deck locally and never deploy that bundle publicly.**

### How reporting behaves

- The deck reports the current slide when it loads and on every slide change: its
  index, its `data-id` and its title (the section's `data-title`, else its first
  heading). Rooms show the title in the "Now showing" bar. Titles are tidied to one
  line of at most 255 characters before sending.
- Reports go out one at a time, and only the latest slide is kept, so flipping
  quickly through slides can't leave the room on a stale one. If the site can't be
  reached (or answers 429 or a server error) it retries every 5 seconds, and the
  deck itself is never blocked.
- If the site refuses a report for good (403 wrong key, 404 unknown room, 422 bad
  slide), the deck writes a warning to the console and stops retrying that slide.
- If `VITE_PRESENTER_KEY` is empty, it warns once and sends nothing.

## Slide ids

Give every `<section>` a unique `data-id` in `index.html`; the room records
activity against it, so ids should stay stable if slides are reordered. Repeated
ids get a numeric suffix at runtime and a console warning, and the slide index is
always unique.
