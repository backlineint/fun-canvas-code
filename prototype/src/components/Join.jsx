import { useState } from 'react';
import { getRoom, join } from '../api.js';

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

const STEP_LABELS = ['Quick tour · 1 of 3', 'Quick tour · 2 of 3', 'Quick tour · 3 of 3', 'Step 1 of 2', 'Step 2 of 2', 'Joined'];

function Face({ avatar, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill={avatar.bg} />
      <circle cx="14" cy="16" r="2.5" fill="#17163A" />
      <circle cx="26" cy="16" r="2.5" fill="#17163A" />
      <path d={avatar.mouth} stroke="#17163A" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

const primaryBtn = 'min-h-14 rounded-2xl text-lg font-bold text-white transition-colors';
const textInput = 'box-border rounded-2xl border-4 border-ink bg-white px-4 text-ink';

export default function Join({ tour = DEFAULT_TOUR, avatars = DEFAULT_AVATARS, onJoined }) {
  const [step, setStep] = useState(0);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [room, setRoom] = useState(null);

  const codeReady = code.trim().length >= 4;
  const nameReady = name.trim().length > 0;

  async function submitCode() {
    if (!codeReady || busy) return;
    setBusy(true);
    setError('');
    try {
      setRoom(await getRoom(code));
      setStep(4);
    } catch (e) {
      setError(e.message === 'closed' ? 'That room has closed.' : "We couldn't find that room. Check the big screen.");
    } finally {
      setBusy(false);
    }
  }

  async function submitProfile() {
    if (!nameReady || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await join(code, { name: name.trim(), avatar });
      try {
        localStorage.setItem('fun-o-meter:participant', JSON.stringify(result.participant));
      } catch {
        // storage can be blocked; the session still works without it
      }
      setRoom(result.room);
      setStep(5);
      if (onJoined) onJoined(result);
    } catch {
      setError('Something went wrong joining. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const card = tour[Math.min(step, tour.length - 1)];

  return (
    <div className="mx-auto box-border flex min-h-dvh w-full max-w-[390px] flex-col gap-5 bg-cream px-6 py-7 font-sans text-ink">
      <div className="text-[13px] font-bold uppercase tracking-[0.12em]">{STEP_LABELS[step]}</div>

      {step < 3 && (
        <div className="flex flex-1 flex-col gap-5">
          <h1 className="m-0 font-display text-[40px] font-extrabold leading-[1.05]">{card.title}</h1>
          <p className="m-0 text-lg leading-snug">{card.body}</p>
          <div className={`relative min-h-40 flex-1 overflow-hidden rounded-3xl ${card.bg}`} aria-hidden="true">
            {Array.from({ length: 6 + step * 2 }).map((_, i) => (
              <span
                key={i}
                className="absolute size-[18px] rounded-full"
                style={{
                  left: `${12 + ((i * 37 + step * 11) % 76)}%`,
                  top: `${12 + ((i * 53 + step * 7) % 50)}%`,
                  background: ['#17163A', '#FF5C4D', '#3B5BFF'][i % 3],
                }}
              />
            ))}
            {step === 1 && (
              <>
                <span className="absolute left-[10%] right-[10%] top-[78%] h-2 rounded bg-ink" />
                <span className="absolute left-[62%] top-[78%] size-[30px] -translate-x-1/2 -translate-y-1/4 rounded-full border-[3px] border-ink bg-coral" />
              </>
            )}
          </div>
          <div className="flex justify-center gap-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`h-2 rounded bg-ink ${i === step ? 'w-7' : 'w-2 opacity-35'}`} />
            ))}
          </div>
          <button type="button" className={`${primaryBtn} bg-ink`} onClick={() => setStep(step + 1)}>
            {step === 2 ? 'Got it. Join a room' : 'Next'}
          </button>
          <button type="button" className="min-h-11 text-[15px] font-bold underline" onClick={() => setStep(3)}>
            Skip the tour
          </button>
        </div>
      )}

      {step === 3 && (
        <form
          className="flex flex-1 flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            submitCode();
          }}
        >
          <h1 className="m-0 font-display text-[40px] font-extrabold leading-[1.05]">Enter the room code</h1>
          <p className="m-0 text-lg leading-snug">It's on the big screen at the front of the room.</p>
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
            aria-describedby={error ? 'code-error' : undefined}
            className={`${textInput} min-h-[72px] text-[32px] font-extrabold uppercase tracking-[0.08em]`}
          />
          {error && (
            <p id="code-error" role="alert" className="m-0 text-base font-bold">
              {error}
            </p>
          )}
          <div className="flex-1" />
          <button type="submit" disabled={!codeReady || busy} className={`${primaryBtn} ${codeReady && !busy ? 'bg-ink' : 'bg-muted'}`}>
            {busy ? 'Checking...' : 'Continue'}
          </button>
        </form>
      )}

      {step === 4 && (
        <form
          className="flex flex-1 flex-col gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            submitProfile();
          }}
        >
          <h1 className="m-0 font-display text-[40px] font-extrabold leading-[1.05]">Who are you?</h1>
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
          <div className="flex-1" />
          <button type="submit" disabled={!nameReady || busy} className={`${primaryBtn} ${nameReady && !busy ? 'bg-ink' : 'bg-muted'}`}>
            {busy ? 'Joining...' : 'Join the room'}
          </button>
        </form>
      )}

      {step === 5 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <Face avatar={avatars[avatar]} size={140} />
          <h1 className="m-0 font-display text-[40px] font-extrabold leading-[1.05]">You're in, {name.trim() || 'friend'}!</h1>
          <p className="m-0 text-lg leading-snug">
            Room {room?.code ?? code} · the talk is on slide {room?.currentSlide ?? '?'}. Your dot is on the swarm now.
          </p>
          <button type="button" className="min-h-11 text-[15px] font-bold underline" onClick={() => { setStep(0); setError(''); }}>
            Start over
          </button>
        </div>
      )}
    </div>
  );
}
