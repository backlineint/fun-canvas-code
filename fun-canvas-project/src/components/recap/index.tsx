import { useEffect } from 'react';
import { avatarAt, Face } from '@/lib/fun-room-avatars';
import { fetchRecap, REQUEST_KINDS } from '@/lib/fun-room-live';
import { applyMood, clearMood, moodOverride } from '@/lib/fun-room-mood';
import { cn } from 'drupal-canvas';
import { useSiteContext } from 'drupal-canvas/react';
import useSWR from 'swr';
import type {
  RecapHighlight,
  RecapSlide,
  RoomRecap,
  Tier,
} from '@/lib/fun-room-live';

type RecapProps = {
  code: string;
  pollMs?: number;
  className?: string;
};

// The tier thresholds the swarm and the server use (SwarmState::tier).
const HIGH = 65;
const LOW = 35;

const TIER_BAR: Record<Tier, string> = {
  high: 'bg-coral',
  mid: 'bg-fun-blue',
  low: 'bg-muted',
};

const tierOf = (median: number): Tier =>
  median >= HIGH ? 'high' : median < LOW ? 'low' : 'mid';

function minutes(seconds: number | null): string | null {
  if (seconds === null) return null;
  const whole = Math.max(1, Math.round(seconds / 60));
  return whole === 1 ? '1 minute' : `${whole} minutes`;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** A slide's name: its title, which is already "Slide N" when the deck never named it. */
const slideName = (slide: { title: string }) => slide.title;

function Tile({
  value,
  label,
  sub,
}: {
  value: string;
  label: string;
  sub: string;
}) {
  return (
    <div className="min-w-0 rounded-3xl bg-cream px-5 py-4">
      <div className="font-display text-5xl leading-none font-extrabold">
        {value}
      </div>
      <div className="mt-1 text-base font-bold">{label}</div>
      <div className="text-sm font-medium [overflow-wrap:anywhere]">{sub}</div>
    </div>
  );
}

// The room's median fun, one point per slide that had enough ratings, drawn over the
// three mood bands. The picture is for sighted readers; a table says the same in text.
function Timeline({
  slides,
  peak,
}: {
  slides: RecapSlide[];
  peak: RecapSlide | null;
}) {
  const width = 600;
  const height = 220;
  const pad = 16;
  const first = slides[0].slide;
  const last = slides[slides.length - 1].slide;
  const x = (slide: number) =>
    last === first
      ? width / 2
      : pad + ((slide - first) / (last - first)) * (width - pad * 2);
  const y = (median: number) =>
    pad + ((100 - median) / 100) * (height - pad * 2);
  const points = slides.map((s) => `${x(s.slide)},${y(s.median)}`).join(' ');
  const peakX = peak ? x(peak.slide) : 0;

  return (
    <>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={
          peak
            ? `Line chart of the room's median fun by slide, peaking at ${peak.median} on ${slideName(peak)}.`
            : "Line chart of the room's median fun by slide."
        }
      >
        <rect
          x="0"
          y="0"
          width={width}
          height={y(HIGH)}
          fill="#ffb4a8"
          opacity="0.5"
        />
        <rect
          x="0"
          y={y(HIGH)}
          width={width}
          height={y(LOW) - y(HIGH)}
          fill="#c9d3ff"
          opacity="0.6"
        />
        <rect
          x="0"
          y={y(LOW)}
          width={width}
          height={height - y(LOW)}
          fill="#d9d7cf"
          opacity="0.7"
        />
        {slides.length > 1 ? (
          <polyline
            points={points}
            fill="none"
            stroke="#17163a"
            strokeWidth="4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {slides.map((s) => (
          <circle
            key={s.slide}
            cx={x(s.slide)}
            cy={y(s.median)}
            r="4"
            fill="#17163a"
          />
        ))}
        {peak ? (
          <>
            <circle
              cx={peakX}
              cy={y(peak.median)}
              r="8"
              fill="#ff5c4d"
              stroke="#17163a"
              strokeWidth="3"
            />
            <text
              x={peakX > width / 2 ? peakX - 14 : peakX + 14}
              y={Math.max(y(peak.median) - 10, 24)}
              textAnchor={peakX > width / 2 ? 'end' : 'start'}
              fontSize="22"
              fontWeight="700"
              fill="#17163a"
            >
              Peak {peak.median}
            </text>
          </>
        ) : null}
      </svg>
      <table className="sr-only">
        <caption>Median fun by slide</caption>
        <thead>
          <tr>
            <th scope="col">Slide</th>
            <th scope="col">Median fun</th>
            <th scope="col">Ratings</th>
          </tr>
        </thead>
        <tbody>
          {slides.map((s) => (
            <tr key={s.slide}>
              <th scope="row">{slideName(s)}</th>
              <td>{s.median}</td>
              <td>{s.votes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Highlight({ card }: { card: RecapHighlight }) {
  return (
    <div className="min-w-0 rounded-3xl bg-cream px-5 py-4">
      <div className="text-[13px] font-bold tracking-[0.08em] uppercase">
        {card.tag}
      </div>
      {card.type === 'comment' ? (
        <>
          <p className="m-0 mt-1.5 text-base font-medium [overflow-wrap:anywhere]">
            {card.text}
          </p>
          <div className="mt-2 flex items-center gap-2 text-sm font-bold">
            <Face avatar={avatarAt(card.avatar)} size={24} />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {card.name ? `${card.name} · ` : ''}
              {slideName(card)}
            </span>
          </div>
        </>
      ) : (
        <>
          <p className="m-0 mt-1.5 font-display text-2xl leading-tight font-extrabold">
            {REQUEST_KINDS.find((k) => k.kind === card.kind)?.label ??
              card.kind}
          </p>
          <div className="mt-2 text-sm font-bold">
            {plural(card.count, 'request')}
          </div>
        </>
      )}
    </div>
  );
}

function requestSummary(requests: RoomRecap['requests']): string {
  const parts = [
    requests.hat ? plural(requests.hat, 'hat') : '',
    requests.noise ? plural(requests.noise, 'noise maker') : '',
    requests.candy ? `${requests.candy} candy` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'none asked for';
}

// The room's recap once it has closed: the headline, a few totals, how the room's fun
// moved through the talk, the best and quietest slides, and a few highlights. The numbers
// come from the server (`/recap`), computed from the room's ratings, comments and
// requests. It is one fetch with a slow refresh, since a closed room barely changes.
export default function Recap({ code, pollMs = 30000, className }: RecapProps) {
  const base = useSiteContext()?.baseUrl ?? '';
  const { data, error } = useSWR(
    code ? ['fun-recap', base, code] : null,
    () => fetchRecap(base, code),
    { refreshInterval: pollMs, dedupingInterval: 0 },
  );

  // The swarm sets the page's mood while the room is open and clears it when it goes
  // away; once the room has closed this takes over, so the page keeps the room's final
  // mood. ?mood=low|mid|high|waiting still overrides it, as on the swarm.
  const tier = data ? data.tier : undefined;
  useEffect(() => {
    if (tier === undefined) return;
    const forced = moodOverride();
    applyMood(forced !== undefined ? forced : tier);
    return clearMood;
  }, [tier]);

  if (!data) {
    return (
      <section
        aria-label="Room recap"
        className={cn('rounded-3xl bg-sun p-6 text-ink', className)}
      >
        <p role="status" className="m-0 text-lg font-bold">
          {error
            ? "We can't load the recap right now. Retrying."
            : 'Gathering the highlights...'}
        </p>
      </section>
    );
  }

  const duration = minutes(data.durationSeconds);
  const rated = data.averageFun !== null;

  return (
    <section
      aria-labelledby="recap-heading"
      className={cn(
        'flex flex-col gap-4 rounded-3xl bg-sun p-5 text-ink lg:p-7',
        className,
      )}
    >
      <header className="flex flex-col gap-1">
        <p className="m-0 text-[13px] font-bold tracking-[0.12em] uppercase">
          Room {data.code} closed
        </p>
        <h2
          id="recap-heading"
          className="m-0 font-display text-4xl leading-none font-extrabold lg:text-5xl"
        >
          {data.headline}
        </h2>
        <p className="m-0 mt-1 text-base font-bold">
          {[duration, plural(data.attendees, 'attendee')]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          value={rated ? String(data.averageFun) : '-'}
          label="Average fun"
          sub={rated ? 'median across the session' : 'nobody rated a slide'}
        />
        <Tile
          value={data.peak ? String(data.peak.median) : '-'}
          label="Peak fun"
          sub={data.peak ? slideName(data.peak) : 'not enough ratings'}
        />
        <Tile
          value={String(data.comments.count)}
          label="Comments"
          sub={
            data.comments.busiest
              ? `${data.comments.busiest.count} on ${slideName(data.comments.busiest)}`
              : 'none yet'
          }
        />
        <Tile
          value={String(data.requests.total)}
          label="Requests"
          sub={requestSummary(data.requests)}
        />
      </div>

      {data.timeline.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-5">
          <div className="flex min-w-0 flex-col gap-2 rounded-3xl bg-cream px-5 py-4 lg:col-span-3">
            <h3 className="m-0 text-lg font-extrabold">
              Median fun, slide by slide
            </h3>
            <Timeline slides={data.timeline} peak={data.peak} />
            <p className="m-0 flex flex-wrap gap-x-4 text-[13px] font-bold">
              <span>Top band: boatloads</span>
              <span>Middle: warming up</span>
              <span>Bottom: sleepy</span>
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-3 rounded-3xl bg-cream px-5 py-4 lg:col-span-2">
            <h3 className="m-0 text-lg font-extrabold">
              Top slides by median fun
            </h3>
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {data.topSlides.map((slide, index) => (
                <li key={slide.slide} className="flex flex-col gap-1">
                  <div className="flex justify-between gap-3 text-[15px] font-bold">
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      {index + 1}. {slideName(slide)}
                    </span>
                    <span>{slide.median}</span>
                  </div>
                  <div
                    className="h-3 rounded-md bg-[#e8dfc8]"
                    aria-hidden="true"
                  >
                    <div
                      className={cn(
                        'h-3 rounded-md',
                        TIER_BAR[tierOf(slide.median)],
                      )}
                      style={{ width: `${slide.median}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
            {data.quietest ? (
              <p className="m-0 text-sm font-medium">
                Quietest: {slideName(data.quietest)} ({data.quietest.median})
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {data.highlights.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {data.highlights.map((card) => (
            <Highlight key={card.tag} card={card} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
