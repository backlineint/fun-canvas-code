#!/usr/bin/env node
// Rehearsal load test: simulates a room of phones (and optionally the slide deck's
// sidebar) against a Fun-o-Meter site, then reports latency and errors per endpoint.
//
// Each simulated phone joins the room once, then behaves like the real components:
//   room status (JSON:API)  every 2s     swarm state   every 2s
//   comments                every 3s     requests      every 3s
//   votes                   every 8-15s  a comment about every 90s, a request about every 2 min
// Only some phones comment or ask (--commenters, default 30%; --askers, default 10%), as in a
// real room. A phone that has asked polls its own requests by id, which a shared cache cannot
// reuse, so a high --askers share is a harsher test.
// (A poll waits for its response, then sleeps, like SWR's refreshInterval.)
// With --deck it also polls like the deck's sidebar: state 1s, comments/ratings/requests 2s.
//
// Needs Node 18+ and no packages. It writes to the site: it creates participants, votes,
// comments and requests in ONE room. Use a throwaway room, never the real talk's.
//
//   1. Create the room:
//        upsun ssh -p <project> -e main -A drupal 'vendor/bin/drush fun-room:create LOAD-TEST'
//   2. Run it (30 phones for 3 minutes, plus the deck):
//        node scripts/loadtest.mjs --base https://your-site --room LOAD-TEST --phones 30 --minutes 3 --deck
//   3. Remove the test data (the room and everything in it): see --cleanup-help.
//
// Limits to know: joining is capped at 50 per IP per 5 minutes, so keep --phones under 50
// and wait 5 minutes between runs from the same network. Comments are capped per person
// and per IP; the script stays well inside both.

import { parseArgs } from 'node:util';
import { randomBytes } from 'node:crypto';

const { values: opts } = parseArgs({
  options: {
    base: { type: 'string' },
    room: { type: 'string', default: 'LOAD-TEST' },
    phones: { type: 'string', default: '30' },
    minutes: { type: 'string', default: '3' },
    ramp: { type: 'string', default: '20' },
    deck: { type: 'boolean', default: false },
    askers: { type: 'string', default: '0.1' },
    commenters: { type: 'string', default: '0.3' },
    insecure: { type: 'boolean', default: false },
    'cleanup-help': { type: 'boolean', default: false },
    project: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
});

const CLEANUP_PHP = [
  "$code = '__ROOM__';",
  "$m = \\Drupal::entityTypeManager();",
  "$rooms = $m->getStorage('node')->loadByProperties(['type' => 'room', 'title' => $code]);",
  '$room = reset($rooms);',
  "if (!$room) { print 'no such room'; return; }",
  "foreach (['fun_vote', 'fun_comment', 'fun_request', 'fun_participant'] as $t) {",
  '  $s = $m->getStorage($t);',
  "  $ids = $s->getQuery()->accessCheck(FALSE)->condition('room', $room->id())->execute();",
  '  $s->delete($s->loadMultiple($ids));',
  "  print $t . ': ' . count($ids) . \"\\n\";",
  '}',
  '$room->delete();',
  "print 'room deleted';",
].join(' ');

function usage() {
  console.log(`Usage: node scripts/loadtest.mjs --base <site origin> [options]

  --base <url>      Site origin, for example https://main-xxxx.us.platformsh.site (required)
  --room <code>     Throwaway room code (default LOAD-TEST). Create it first.
  --phones <n>      Simulated phones (default 30, max 49)
  --minutes <n>     How long to run after everyone has joined (default 3)
  --ramp <seconds>  Spread the joins over this long (default 20)
  --deck            Also simulate the deck's sidebar polling
  --askers <0-1>    Share of phones that ask for a hat, noise maker or candy (default 0.1)
  --commenters <0-1> Share of phones that post comments (default 0.3)
  --insecure        Skip TLS verification (local DDEV only)
  --cleanup-help    Print the commands that delete the test room and its data
  --project <id>    Upsun project id, filled into the cleanup command`);
}

if (opts.help || (!opts.base && !opts['cleanup-help'])) {
  usage();
  process.exit(opts.help ? 0 : 1);
}

if (opts['cleanup-help']) {
  const php = CLEANUP_PHP.replace('__ROOM__', opts.room);
  // The PHP is passed as base64 so no quote or $ in it can be mangled by the shell, locally
  // or on the server. base64 only contains letters, digits, + / and =.
  const b64 = Buffer.from(php).toString('base64');
  const project = opts.project ?? '<project>';
  console.log(`Deletes room ${opts.room} and its participants, votes, comments and requests.`);
  console.log('(The room itself goes to Drupal Trash, so it stops loading but its row stays.)\n');
  console.log('Live site:');
  console.log(`  upsun ssh -p ${project} -e main -A drupal 'vendor/bin/drush php:eval "$(echo ${b64} | base64 -d)"'\n`);
  console.log('Local DDEV (from the site/ folder):');
  console.log(`  ddev drush php:eval "$(echo ${b64} | base64 -d)"`);
  process.exit(0);
}

if (opts.insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const BASE = opts.base.replace(/\/+$/, '');
const ROOM = opts.room.trim().toUpperCase();
const PHONES = Math.min(49, Math.max(1, Number(opts.phones)));
const RUN_MS = Number(opts.minutes) * 60_000;
const RAMP_MS = Number(opts.ramp) * 1000;
const share = (value) => Math.min(1, Math.max(0, Number(value)));
const ASKERS = Math.round(PHONES * share(opts.askers));
const COMMENTERS = Math.round(PHONES * share(opts.commenters));
const TIMEOUT_MS = 10_000;
const api = (name) => `${BASE}/api/fun/rooms/${encodeURIComponent(ROOM)}/${name}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rand = (min, max) => min + Math.random() * (max - min);

// ---------------------------------------------------------------- measurements

const samples = new Map(); // endpoint -> { ms: number[], status: Map<number, count> }
const timeline = new Map(); // 10s bucket -> { n, errors, ms: number[] }
let t0 = performance.now();
let stopping = false;

function record(name, ms, status) {
  const s = samples.get(name) ?? { ms: [], status: new Map() };
  s.ms.push(ms);
  s.status.set(status, (s.status.get(status) ?? 0) + 1);
  samples.set(name, s);
  const bucket = Math.floor((performance.now() - t0) / 10_000);
  const b = timeline.get(bucket) ?? { n: 0, errors: 0, ms: [] };
  b.n++;
  b.ms.push(ms);
  if (status < 200 || status >= 400) b.errors++;
  timeline.set(bucket, b);
}

const pct = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;

async function call(name, url, init = {}) {
  const start = performance.now();
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await response.text();
    record(name, performance.now() - start, response.status);
    return { status: response.status, text };
  } catch (error) {
    // -1 is a timeout, 0 any other network failure.
    record(name, performance.now() - start, error?.name === 'TimeoutError' ? -1 : 0);
    return { status: 0, text: '' };
  }
}

const json = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------- the simulation

let roomUuid = '';

async function lookupRoom() {
  const url = `${BASE}/jsonapi/node/room?filter%5Btitle%5D=${encodeURIComponent(ROOM)}`;
  const response = await fetch(url, { headers: { Accept: 'application/vnd.api+json' } });
  if (!response.ok) throw new Error(`room lookup answered ${response.status}`);
  const body = await response.json();
  const room = body?.data?.[0];
  if (!room) {
    throw new Error(
      `Room ${ROOM} does not exist. Create it first:\n  upsun ssh -p <project> -e main -A drupal 'vendor/bin/drush fun-room:create ${ROOM}'`,
    );
  }
  if (room.attributes?.field_status === 'closed') throw new Error(`Room ${ROOM} is closed.`);
  return room.id;
}

// Repeats `fn` about every `everyMs` (after it finishes), starting at a random offset so
// the phones do not poll in lockstep.
async function every(everyMs, fn) {
  await sleep(rand(0, everyMs));
  while (!stopping) {
    await fn();
    await sleep(everyMs * rand(0.95, 1.05));
  }
}

async function phone(index) {
  await sleep((RAMP_MS * index) / PHONES);
  if (stopping) return;

  const token = randomBytes(24).toString('hex');
  const joined = await call('join', `${BASE}/jsonapi/fun_participant/fun_participant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/vnd.api+json', Accept: 'application/vnd.api+json' },
    body: JSON.stringify({
      data: {
        type: 'fun_participant--fun_participant',
        attributes: { name: `Load ${index + 1}`, avatar: index % 6, token },
        relationships: { room: { data: { type: 'node--room', id: roomUuid } } },
      },
    }),
  });
  if (joined.status !== 201) return; // recorded as an error above

  const auth = { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Participant-Token': token };
  const jsonHeaders = { Accept: 'application/json' };
  let lastComment = 0;
  const myRequests = [];
  let level = Math.round(rand(20, 90));

  await Promise.all([
    every(2000, () =>
      call('room (JSON:API)', `${BASE}/jsonapi/node/room/${roomUuid}`, {
        headers: { Accept: 'application/vnd.api+json' },
      }),
    ),
    every(2000, () => call('state', api('state'), { headers: jsonHeaders })),
    every(3000, async () => {
      const r = await call('comments', `${api('comments')}${lastComment ? `?after=${lastComment}` : ''}`, {
        headers: jsonHeaders,
      });
      const comments = json(r.text)?.comments;
      if (comments?.length) lastComment = Math.max(lastComment, ...comments.map((c) => c.id));
    }),
    every(3000, () =>
      call('requests', `${api('requests')}?ids=${myRequests.slice(-20).join(',')}`, { headers: jsonHeaders }),
    ),
    every(rand(8000, 15000), () => {
      level = Math.max(0, Math.min(100, level + Math.round(rand(-25, 25))));
      return call('vote', api('vote'), { method: 'POST', headers: auth, body: JSON.stringify({ value: level }) });
    }),
    // The first phones ask, the last phones comment, so the two groups differ.
    ...(index >= PHONES - COMMENTERS
      ? [
          every(90_000, () =>
            call('post comment', api('comments'), {
              method: 'POST',
              headers: auth,
              body: JSON.stringify({ text: `Load test comment from phone ${index + 1}` }),
            }),
          ),
        ]
      : []),
    ...(index < ASKERS
      ? [
          every(120_000, async () => {
            const kind = ['hat', 'noise', 'candy'][index % 3];
            const r = await call('post request', api('requests'), {
              method: 'POST',
              headers: auth,
              body: JSON.stringify({ kind, note: 'Load test' }),
            });
            const id = json(r.text)?.id;
            if (id && !myRequests.includes(id)) myRequests.push(id);
          }),
        ]
      : []),
  ]);
}

async function deck() {
  const headers = { Accept: 'application/json' };
  await Promise.all([
    every(1000, () => call('deck: state', api('state'), { headers })),
    every(2000, () => call('deck: comments', api('comments'), { headers })),
    every(2000, () => call('deck: ratings', api('ratings'), { headers })),
    every(2000, () => call('deck: requests', api('requests'), { headers })),
  ]);
}

// ---------------------------------------------------------------- reporting

const fmt = (n) => String(Math.round(n)).padStart(6);

function report() {
  const elapsed = (performance.now() - t0) / 1000;
  console.log(`\n=== ${PHONES} phones${opts.deck ? ' + deck' : ''} on ${BASE}, room ${ROOM} (${elapsed.toFixed(0)}s) ===`);
  console.log(`${ASKERS} phones ask for things, ${COMMENTERS} post comments, all vote\n`);
  console.log('endpoint'.padEnd(18) + 'count'.padStart(7) + 'req/s'.padStart(7) + 'p50 ms'.padStart(8) + 'p95 ms'.padStart(8) + 'p99 ms'.padStart(8) + 'max ms'.padStart(8) + '  errors');
  let total = 0;
  let totalErrors = 0;
  let allMs = [];
  for (const [name, s] of [...samples].sort()) {
    const sorted = [...s.ms].sort((a, b) => a - b);
    let errors = 0;
    const codes = [];
    for (const [status, count] of [...s.status].sort((a, b) => a[0] - b[0])) {
      const bad = status < 200 || status >= 400;
      if (bad) errors += count;
      if (bad) codes.push(`${status === -1 ? 'timeout' : status === 0 ? 'network' : status}×${count}`);
    }
    total += s.ms.length;
    totalErrors += errors;
    allMs = allMs.concat(s.ms);
    console.log(
      name.padEnd(18) + String(s.ms.length).padStart(7) + (s.ms.length / elapsed).toFixed(1).padStart(7) +
        fmt(pct(sorted, 50)).padStart(8) + fmt(pct(sorted, 95)).padStart(8) + fmt(pct(sorted, 99)).padStart(8) +
        fmt(sorted.at(-1) ?? 0).padStart(8) + (errors ? `  ${codes.join(' ')}` : '  none'),
    );
  }
  allMs.sort((a, b) => a - b);
  const p95 = pct(allMs, 95);
  const errorRate = total ? (totalErrors / total) * 100 : 0;
  console.log(`\nTotal ${total} requests, ${(total / elapsed).toFixed(1)}/s, p95 ${Math.round(p95)} ms, ${errorRate.toFixed(2)}% errors`);

  console.log('\nOver time (10 s buckets): req/s, p95 ms, errors');
  for (const [bucket, b] of [...timeline].sort((a, c) => a[0] - c[0])) {
    const sorted = b.ms.sort((a, c) => a - c);
    console.log(`  ${String(bucket * 10).padStart(4)}s  ${(b.n / 10).toFixed(1).padStart(5)}/s  p95 ${fmt(pct(sorted, 95))}  errors ${b.errors}`);
  }

  const verdict =
    errorRate >= 1 || p95 >= 2000 ? 'FAIL' : p95 >= 1000 || errorRate >= 0.1 ? 'MARGINAL' : 'PASS';
  console.log(
    `\nVerdict: ${verdict}  (PASS: p95 under 1 s and under 0.1% errors. FAIL: p95 over 2 s or 1% errors or more.)`,
  );
  console.log(`\nClean up: node scripts/loadtest.mjs --room ${ROOM} --cleanup-help`);
}

// ---------------------------------------------------------------- run

process.on('SIGINT', () => {
  if (stopping) process.exit(1);
  console.log('\nStopping...');
  stopping = true;
});

try {
  roomUuid = await lookupRoom();
} catch (error) {
  const cause = error?.cause?.code ?? error?.cause?.message;
  console.error(cause ? `${error.message} (${cause})` : error.message);
  if (error.message === 'fetch failed') {
    console.error(
      `\nCould not reach ${BASE}. This is the network between this computer and the site, not the room.\n` +
        'Check it first with:  curl -sI ' + BASE + '/ | head -1\n' +
        'On a firewalled network, connect to a phone hotspot and try again.' +
        (cause === 'UND_ERR_CONNECT_TIMEOUT' ? ' (A connect timeout often means a firewall is stalling the connection.)' : '') +
        (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY/.test(String(cause)) ? ' (A certificate error often means a firewall is re-signing HTTPS traffic.)' : ''),
    );
  }
  process.exit(1);
}

console.log(`Room ${ROOM} found. Joining ${PHONES} phones over ${opts.ramp}s (${ASKERS} will ask for things, ${COMMENTERS} will comment), then running ${opts.minutes} min${opts.deck ? ' with the deck sidebar' : ''}. Ctrl-C stops early.`);
t0 = performance.now();
const workers = [...Array.from({ length: PHONES }, (_, i) => phone(i)), ...(opts.deck ? [deck()] : [])];

const progress = setInterval(() => {
  const last = timeline.get(Math.floor((performance.now() - t0) / 10_000) - 1);
  if (last) {
    const sorted = [...last.ms].sort((a, b) => a - b);
    console.log(`  ${String(Math.round((performance.now() - t0) / 1000)).padStart(4)}s  ${(last.n / 10).toFixed(1)} req/s  p95 ${Math.round(pct(sorted, 95))} ms  errors ${last.errors}`);
  }
}, 10_000);

await sleep(RAMP_MS + RUN_MS);
stopping = true;
clearInterval(progress);
await Promise.race([Promise.allSettled(workers), sleep(TIMEOUT_MS + 3000)]);
report();
process.exit(0);
