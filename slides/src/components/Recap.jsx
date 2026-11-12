import { useEffect, useState } from 'preact/hooks';
import { getRecap, roomCode } from '../room.js';
import { useDeckView } from '../useDeckView.js';
import { useRoomState } from '../useRoomState.js';
import ViewButton from './ViewButton.jsx';

// The same six colors as the attendee avatars (fun-canvas-project/src/lib/fun-room-avatars.tsx).
const AVATAR_COLORS = ['#FF5C4D', '#FFD84D', '#3B5BFF', '#7FD6A8', '#C9B6FF', '#FFB4A8'];
const KIND_LABELS = { hat: 'Party hats', noise: 'Noise makers', candy: 'Candy' };

// The tier thresholds the swarm and the server use.
const HIGH = 65;
const LOW = 35;
const BAR = (median) => (median >= HIGH ? 'bg-coral' : 'bg-fun-blue');

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function minutes(seconds) {
  if (seconds === null || seconds === undefined) return null;
  const whole = Math.max(1, Math.round(seconds / 60));
  return whole === 1 ? '1 minute' : `${whole} minutes`;
}

function Tile({ value, label, sub }) {
  return (
    <div className="min-w-0 rounded-3xl bg-cream px-[1.4vw] py-[1.2vh]">
      <div className="font-display text-[clamp(2.5rem,7vh,6rem)] leading-none font-extrabold">{value}</div>
      <div className="mt-1 text-[clamp(1rem,2.2vh,1.75rem)] font-bold">{label}</div>
      <div className="text-[clamp(0.85rem,1.8vh,1.4rem)] font-medium [overflow-wrap:anywhere]">{sub}</div>
    </div>
  );
}

// The room's median fun, one point per slide that had enough ratings, over the three mood bands.
function Timeline({ slides, peak }) {
  const width = 600;
  const height = 220;
  const pad = 16;
  const first = slides[0].slide;
  const last = slides[slides.length - 1].slide;
  const x = (slide) => (last === first ? width / 2 : pad + ((slide - first) / (last - first)) * (width - pad * 2));
  const y = (median) => pad + ((100 - median) / 100) * (height - pad * 2);
  const points = slides.map((s) => `${x(s.slide)},${y(s.median)}`).join(' ');
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full min-h-0 w-full"
      role="img"
      aria-label={peak ? `Line chart of the room's median fun by slide, peaking at ${peak.median} on ${peak.title}.` : "Line chart of the room's median fun by slide."}
    >
      <rect x="0" y="0" width={width} height={y(HIGH)} fill="#ffb4a8" opacity="0.5" />
      <rect x="0" y={y(HIGH)} width={width} height={y(LOW) - y(HIGH)} fill="#c9d3ff" opacity="0.6" />
      <rect x="0" y={y(LOW)} width={width} height={height - y(LOW)} fill="#d9d7cf" opacity="0.7" />
      {slides.length > 1 ? <polyline points={points} fill="none" stroke="#17163a" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" /> : null}
      {slides.map((s) => (
        <circle key={s.slide} cx={x(s.slide)} cy={y(s.median)} r="4" fill="#17163a" />
      ))}
      {peak ? (
        <>
          <circle cx={x(peak.slide)} cy={y(peak.median)} r="8" fill="#ff5c4d" stroke="#17163a" stroke-width="3" />
          <text
            x={x(peak.slide) > width / 2 ? x(peak.slide) - 14 : x(peak.slide) + 14}
            y={Math.max(y(peak.median) - 8, 14)}
            text-anchor={x(peak.slide) > width / 2 ? 'end' : 'start'}
            font-size="14"
            font-weight="700"
            fill="#17163a"
          >
            Peak {peak.median}
          </text>
        </>
      ) : null}
    </svg>
  );
}

function Highlight({ card }) {
  return (
    <div className="min-w-0 rounded-3xl bg-cream px-[1.4vw] py-[1.2vh]">
      <div className="text-[clamp(0.75rem,1.6vh,1.2rem)] font-bold tracking-[0.08em] uppercase">{card.tag}</div>
      {card.type === 'comment' ? (
        <>
          <p className="m-0 mt-1 text-[clamp(1rem,2.4vh,1.9rem)] leading-snug font-medium [overflow-wrap:anywhere]">{card.text}</p>
          <div className="mt-1.5 flex items-center gap-2 text-[clamp(0.85rem,1.8vh,1.4rem)] font-bold">
            <span className="size-6 shrink-0 rounded-full" style={{ background: AVATAR_COLORS[card.avatar] ?? AVATAR_COLORS[0] }} aria-hidden="true" />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {card.name ? `${card.name} · ` : ''}
              {card.title}
            </span>
          </div>
        </>
      ) : (
        <>
          <p className="m-0 mt-1 font-display text-[clamp(1.5rem,4vh,3rem)] leading-tight font-extrabold">{KIND_LABELS[card.kind] ?? card.kind}</p>
          <div className="mt-1.5 text-[clamp(0.85rem,1.8vh,1.4rem)] font-bold">{plural(card.count, 'request')}</div>
        </>
      )}
    </div>
  );
}

function requestSummary(requests) {
  const parts = [
    requests.hat ? plural(requests.hat, 'hat') : '',
    requests.noise ? plural(requests.noise, 'noise maker') : '',
    requests.candy ? `${requests.candy} candy` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'none asked for';
}

// The room's end-of-session recap, filling the screen (D, or the Recap button that appears
// when the room closes). It reads the same /recap the attendees' page does, and only asks
// while this view is open. It never opens by itself.
export default function Recap() {
  const open = useDeckView() === 'recap';
  const { state } = useRoomState();
  const [recap, setRecap] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    const load = async () => {
      try {
        const data = await getRecap();
        if (live) {
          setRecap(data);
          setFailed(false);
        }
      } catch {
        if (live) setFailed(true);
      }
    };
    load();
    const timer = setInterval(load, 10000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [open]);

  if (!open) return null;

  // The recap can lag the room by a few seconds (it is cached), so either one saying closed counts.
  const closed = recap?.status === 'closed' || state?.status === 'closed';
  const duration = minutes(recap?.durationSeconds);

  return (
    <section aria-labelledby="deck-recap-heading" className="flex h-full min-h-0 flex-col gap-[1.6vh] overflow-y-auto rounded-3xl bg-sun px-[3vw] py-[3vh] text-left text-ink">
      <header className="flex items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="text-[clamp(0.8rem,1.8vh,1.3rem)] font-bold tracking-[0.12em] uppercase">
            Room {recap?.code ?? roomCode} {closed ? 'closed' : 'is still open · preview'}
          </div>
          <h1 id="deck-recap-heading" className="m-0 mt-1 font-display text-[clamp(2.5rem,8vh,6rem)] leading-none font-extrabold">
            {recap ? recap.headline : failed ? "Can't load the recap right now" : 'Gathering the highlights...'}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-[clamp(0.9rem,2.2vh,1.6rem)] font-bold">
          {recap ? [duration, plural(recap.attendees, 'attendee')].filter(Boolean).join(' · ') : null}
          <ViewButton target="recap" name="the recap" keyName="D" />
        </div>
      </header>

      {recap ? (
        <>
          <div className="grid shrink-0 grid-cols-4 gap-[1vw]">
            <Tile value={recap.averageFun === null ? '-' : String(recap.averageFun)} label="Average fun" sub={recap.averageFun === null ? 'nobody rated a slide' : 'median across the session'} />
            <Tile value={recap.peak ? String(recap.peak.median) : '-'} label="Peak fun" sub={recap.peak ? recap.peak.title : 'not enough ratings'} />
            <Tile value={String(recap.comments.count)} label="Comments" sub={recap.comments.busiest ? `${recap.comments.busiest.count} on ${recap.comments.busiest.title}` : 'none yet'} />
            <Tile value={String(recap.requests.total)} label="Requests" sub={requestSummary(recap.requests)} />
          </div>

          {recap.timeline.length > 0 ? (
            <div className="grid min-h-0 flex-1 grid-cols-5 gap-[1vw]">
              <div className="col-span-3 flex min-h-0 min-w-0 flex-col gap-2 rounded-3xl bg-cream px-[1.4vw] py-[1.2vh]">
                <h2 className="m-0 text-[clamp(1rem,2.4vh,1.8rem)] font-extrabold">Median fun, slide by slide</h2>
                <div className="min-h-0 flex-1">
                  <Timeline slides={recap.timeline} peak={recap.peak} />
                </div>
                <p className="m-0 flex gap-6 text-[clamp(0.75rem,1.6vh,1.2rem)] font-bold">
                  <span>Top band: boatloads</span>
                  <span>Middle: warming up</span>
                  <span>Bottom: sleepy</span>
                </p>
              </div>
              <div className="col-span-2 flex min-h-0 min-w-0 flex-col gap-[1.2vh] rounded-3xl bg-cream px-[1.4vw] py-[1.2vh]">
                <h2 className="m-0 text-[clamp(1rem,2.4vh,1.8rem)] font-extrabold">Top slides by median fun</h2>
                <ol className="m-0 flex list-none flex-col gap-[1.2vh] p-0">
                  {recap.topSlides.map((slide, index) => (
                    <li key={slide.slide} className="flex flex-col gap-1">
                      <div className="flex justify-between gap-3 text-[clamp(0.9rem,2vh,1.5rem)] font-bold">
                        <span className="min-w-0 [overflow-wrap:anywhere]">
                          {index + 1}. {slide.title}
                        </span>
                        <span>{slide.median}</span>
                      </div>
                      <div className="h-3 rounded-md bg-[#e8dfc8]" aria-hidden="true">
                        <div className={`h-3 rounded-md ${BAR(slide.median)}`} style={{ width: `${slide.median}%` }} />
                      </div>
                    </li>
                  ))}
                </ol>
                {recap.quietest ? (
                  <p className="m-0 text-[clamp(0.85rem,1.8vh,1.4rem)] font-medium">
                    Quietest: {recap.quietest.title} ({recap.quietest.median})
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex-1" />
          )}

          {recap.highlights.length > 0 ? (
            <div className="grid shrink-0 grid-cols-3 gap-[1vw]">
              {recap.highlights.map((card) => (
                <Highlight key={card.tag} card={card} />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
