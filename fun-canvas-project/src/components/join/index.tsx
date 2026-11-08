import { useState } from 'react';
import { getRoom, join } from '@/lib/fun-room-api';
import { useJsonApiClient } from 'drupal-canvas/react';
import type { JoinResult, Room } from '@/lib/fun-room-api';

type TourStep = {
  title: string;
  body: string;
  bg: string;
};

type Avatar = {
  bg: string;
  mouth: string;
};

type JoinProps = {
  tour?: TourStep[];
  avatars?: Avatar[];
  onJoined?: (result: JoinResult) => void;
};

const DEFAULT_TOUR = [
  {
    title: 'Welcome to the Fun-o-Meter',
    body: 'Everyone in this room is a dot. Together, you decide how this talk feels.',
    bg: 'bg-sun',
  },
  {
    title: 'Slide your dot',
    body: 'Show how much fun you are having, any time. The room median shows up on the big screen.',
    bg: 'bg-[#c9d3ff]',
  },
  {
    title: 'The app mirrors the room',
    body: 'Low median: quiet and gray. High median: loud, colorful and wiggly. Also: comment, and request party hats, noise makers or candy.',
    bg: 'bg-[#ffb4a8]',
  },
];

const DEFAULT_AVATARS = [
  { bg: '#FF5C4D', mouth: 'M 12 26 Q 20 33 28 26' },
  { bg: '#FFD84D', mouth: 'M 12 28 L 28 28' },
  { bg: '#3B5BFF', mouth: 'M 11 25 Q 20 37 29 25 Z' },
  { bg: '#7FD6A8', mouth: 'M 12 28 Q 20 24 28 28' },
  { bg: '#C9B6FF', mouth: 'M 13 27 Q 20 32 27 27' },
  { bg: '#FFB4A8', mouth: 'M 12 25 Q 20 35 28 25' },
];

const STEP_LABELS = [
  'Quick tour · 1 of 3',
  'Quick tour · 2 of 3',
  'Quick tour · 3 of 3',
  'Step 1 of 2',
  'Step 2 of 2',
  'Joined',
];

function Face({ avatar, size }: { avatar: Avatar; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill={avatar.bg} />
      <circle cx="14" cy="16" r="2.5" fill="#17163A" />
      <circle cx="26" cy="16" r="2.5" fill="#17163A" />
      <path
        d={avatar.mouth}
        stroke="#17163A"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Dots({ step, count }: { step: number; count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="absolute size-[18px] rounded-full lg:size-6"
          style={{
            left: `${12 + ((i * 37 + step * 11) % 76)}%`,
            top: `${12 + ((i * 53 + step * 7) % 50)}%`,
            background: ['#17163A', '#FF5C4D', '#3B5BFF'][i % 3],
          }}
        />
      ))}
      {step === 1 && (
        <>
          <span className="absolute top-[78%] right-[10%] left-[10%] h-2 rounded bg-ink" />
          <span className="absolute top-[78%] left-[62%] size-[30px] -translate-x-1/2 -translate-y-1/4 rounded-full border-[3px] border-ink bg-coral lg:size-10" />
        </>
      )}
    </>
  );
}

const primaryBtn =
  'min-h-14 rounded-2xl text-lg font-bold text-white transition-colors';
const textInput =
  'box-border rounded-2xl border-4 border-ink bg-white px-4 text-ink';
const heading =
  'm-0 font-display text-[40px] font-extrabold leading-[1.05] lg:text-5xl';
const lead = 'm-0 text-lg leading-snug lg:text-xl';
// On large screens the form stacks under its heading instead of pinning the button to the bottom.
const stack = 'flex flex-1 flex-col lg:flex-none';
const spacer = 'flex-1 lg:hidden';

export default function Join({
  tour = DEFAULT_TOUR,
  avatars = DEFAULT_AVATARS,
  onJoined,
}: JoinProps) {
  const client = useJsonApiClient();
  const [step, setStep] = useState(0);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [room, setRoom] = useState<Room | null>(null);

  const codeReady = code.trim().length >= 4;
  const nameReady = name.trim().length > 0;

  async function submitCode() {
    if (!codeReady || busy) return;
    setBusy(true);
    setError('');
    try {
      setRoom(await getRoom(client, code));
      setStep(4);
    } catch (e) {
      const reason = e instanceof Error ? e.message : '';
      setError(
        reason === 'closed'
          ? 'That room has closed.'
          : reason === 'not_found'
            ? "We couldn't find that room. Check the big screen."
            : "We couldn't reach the room. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitProfile() {
    if (!nameReady || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await join(client, code, { name: name.trim(), avatar });
      try {
        localStorage.setItem(
          'fun-o-meter:participant',
          JSON.stringify(result.participant),
        );
      } catch {
        // storage can be blocked; the session still works without it
      }
      setRoom(result.room);
      setStep(5);
      if (onJoined) onJoined(result);
    } catch (e) {
      const reason = e instanceof Error ? e.message : '';
      setError(
        reason === 'closed'
          ? 'That room has closed.'
          : reason === 'rate_limited'
            ? 'Too many people are joining from this network. Try again in a few minutes.'
            : 'Something went wrong joining. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const card = tour[Math.min(step, tour.length - 1)];
  const asideBg = step < 3 ? card.bg : 'bg-sun';

  return (
    <div className="min-h-dvh bg-cream font-sans text-ink lg:grid lg:grid-cols-2">
      {/* Large screens only: the illustration moves out of the form column into its own panel. */}
      <aside
        aria-hidden="true"
        className={`relative hidden overflow-hidden lg:block ${asideBg}`}
      >
        {step < 4 ? (
          <Dots
            step={step === 3 ? 0 : step}
            count={(step === 3 ? 0 : step) * 3 + 14}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-8">
            <Face avatar={avatars[avatar]} size={240} />
            <p className="m-0 font-display text-5xl font-extrabold">
              {name.trim() || 'Your name'}
            </p>
          </div>
        )}
        <div className="absolute bottom-10 left-12 font-display text-3xl font-extrabold">
          Fun-o-Meter
        </div>
      </aside>

      <main className="mx-auto box-border flex min-h-dvh w-full max-w-[390px] flex-col gap-5 px-6 py-7 lg:max-w-[560px] lg:justify-center lg:gap-6 lg:px-12 lg:py-16">
        <div className="text-[13px] font-bold tracking-[0.12em] uppercase">
          {STEP_LABELS[step]}
        </div>

        {step < 3 && (
          <div className={`${stack} gap-5 lg:gap-6`}>
            <h1 className={heading}>{card.title}</h1>
            <p className={lead}>{card.body}</p>
            <div
              className={`relative min-h-40 flex-1 overflow-hidden rounded-3xl lg:hidden ${card.bg}`}
              aria-hidden="true"
            >
              <Dots step={step} count={6 + step * 2} />
            </div>
            <div
              className="flex justify-center gap-2 lg:justify-start"
              aria-hidden="true"
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={`h-2 rounded bg-ink ${i === step ? 'w-7' : 'w-2 opacity-35'}`}
                />
              ))}
            </div>
            <button
              type="button"
              className={`${primaryBtn} bg-ink`}
              onClick={() => setStep(step + 1)}
            >
              {step === 2 ? 'Got it. Join a room' : 'Next'}
            </button>
            <button
              type="button"
              className="min-h-11 text-[15px] font-bold underline"
              onClick={() => setStep(3)}
            >
              Skip the tour
            </button>
          </div>
        )}

        {step === 3 && (
          <form
            className={`${stack} gap-5 lg:gap-6`}
            // Native submission is blocked in sandboxed previews (no
            // allow-forms), so Enter and the button call the handler directly.
            onSubmit={(e) => e.preventDefault()}
          >
            <h1 className={heading}>Enter the room code</h1>
            <p className={lead}>
              It&apos;s on the big screen at the front of the room.
            </p>
            <label htmlFor="code" className="text-sm font-bold">
              Room code
            </label>
            <input
              id="code"
              autoComplete="off"
              placeholder="NED-0000"
              value={code}
              onChange={(e) => {
                setCode(e.currentTarget.value.toUpperCase());
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitCode();
                }
              }}
              aria-describedby={error ? 'code-error' : undefined}
              className={`${textInput} min-h-[72px] text-[32px] font-extrabold tracking-[0.08em] uppercase`}
            />
            {error && (
              <p
                id="code-error"
                role="alert"
                className="m-0 text-base font-bold"
              >
                {error}
              </p>
            )}
            <div className={spacer} />
            <button
              type="button"
              onClick={submitCode}
              disabled={!codeReady || busy}
              className={`${primaryBtn} ${codeReady && !busy ? 'bg-ink' : 'bg-muted'}`}
            >
              {busy ? 'Checking...' : 'Continue'}
            </button>
          </form>
        )}

        {step === 4 && (
          <form
            className={`${stack} gap-3.5 lg:gap-5`}
            onSubmit={(e) => e.preventDefault()}
          >
            <h1 className={heading}>Who are you?</h1>
            <label htmlFor="nm" className="text-sm font-bold">
              Your name (shown to the room)
            </label>
            <input
              id="nm"
              autoComplete="given-name"
              placeholder="Sam"
              maxLength={30}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitProfile();
                }
              }}
              className={`${textInput} min-h-14 text-[22px] font-bold`}
            />
            <div className="text-sm font-bold">Pick an avatar</div>
            <div className="grid grid-cols-3 gap-3">
              {avatars.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Avatar ${i + 1}`}
                  aria-pressed={avatar === i}
                  onClick={() => setAvatar(i)}
                  className={`flex min-h-22 items-center justify-center rounded-[20px] border-4 bg-white ${avatar === i ? 'border-ink' : 'border-transparent'}`}
                >
                  <Face avatar={a} size={56} />
                </button>
              ))}
            </div>
            {error && (
              <p role="alert" className="m-0 text-base font-bold">
                {error}
              </p>
            )}
            <div className={spacer} />
            <button
              type="button"
              onClick={submitProfile}
              disabled={!nameReady || busy}
              className={`${primaryBtn} ${nameReady && !busy ? 'bg-ink' : 'bg-muted'}`}
            >
              {busy ? 'Joining...' : 'Join the room'}
            </button>
          </form>
        )}

        {step === 5 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center lg:flex-none lg:items-start lg:text-left">
            <span className="lg:hidden">
              <Face avatar={avatars[avatar]} size={140} />
            </span>
            <h1 className={heading}>
              You&apos;re in, {name.trim() || 'friend'}!
            </h1>
            <p className={lead}>
              Room {room?.code ?? code} · the talk is on slide{' '}
              {room ? room.currentSlide + 1 : '?'}. Your dot is on the swarm
              now.
            </p>
            <button
              type="button"
              className="min-h-11 text-[15px] font-bold underline"
              onClick={() => {
                setStep(0);
                setError('');
              }}
            >
              Start over
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
