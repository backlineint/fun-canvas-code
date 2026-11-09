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

## The swarm slide

With `VITE_ROOM_API` set, the swarm slide shows the room's real dots, median and mood
from `GET /api/fun/rooms/{code}/state`, with each dot colored like its owner's avatar.
Without it you get the simulated crowd. If the site can't be reached the slide says
"No connection to the room".

### Mood theming

`src/mood.js` polls the room's state once a second for the whole deck (the swarm slide
reads the same poll) and writes the room's mood to `<html data-mood>`. `src/index.css`
turns that into the background and an edge glow on every slide, and confetti goes off
when the room climbs into "high". A new mood needs two polls in a row, so a median on
a threshold doesn't flicker. Add `?mood=low|mid|high|waiting` to the deck's address to
rehearse a mood (`#/17` is the swarm slide). Reduced motion turns off the fade, glow
pulse and confetti. The steadying and confetti are copies of the room page's
(`fun-canvas-project/src/lib/fun-room-mood.ts`, `fun-room-confetti.ts`); keep them in step.

## The room sidebar

A sidebar stays on screen for the whole talk (about 22% of the width, 300-440px). Its top
third is `RoomPulse`, a compact swarm with the room code, count, median and mood; its
bottom two thirds is `ActivityStream`, a placeholder ("Coming soon") for comments,
requests and joins. Both read the deck's one poll (`src/mood.js` via `src/useRoomState.js`),
so the sidebar adds no requests. The dots come from `SwarmField`, shared with the swarm slide.

The deck runs in Reveal's embedded mode beside the sidebar (`.deck-layout` in `index.html`);
slides keep their 1280x720 design and scale to fit what's left. Add `?sidebar=off` to the
address to hide it (the sidebar is also hidden when printing). When the activity feed
exists, put its items in the `role="log"` region of `ActivityStream.jsx`; the item shape is
documented there.

## Slide ids

Give every `<section>` a unique `data-id` in `index.html`; the room records
activity against it, so ids should stay stable if slides are reordered. Repeated
ids get a numeric suffix at runtime and a console warning, and the slide index is
always unique.
