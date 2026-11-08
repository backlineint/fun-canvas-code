// The attendee avatars. A participant stores only an index into AVATARS, so the
// Join flow (which offers the choices) and the room page (which shows the one
// that was picked) draw them from this one list.

export type Avatar = {
  bg: string;
  mouth: string;
};

export const AVATARS: Avatar[] = [
  { bg: '#FF5C4D', mouth: 'M 12 26 Q 20 33 28 26' },
  { bg: '#FFD84D', mouth: 'M 12 28 L 28 28' },
  { bg: '#3B5BFF', mouth: 'M 11 25 Q 20 37 29 25 Z' },
  { bg: '#7FD6A8', mouth: 'M 12 28 Q 20 24 28 28' },
  { bg: '#C9B6FF', mouth: 'M 13 27 Q 20 32 27 27' },
  { bg: '#FFB4A8', mouth: 'M 12 25 Q 20 35 28 25' },
];

/** The avatar at `index`, falling back to the first for a stale or bad value. */
export function avatarAt(index: number, avatars: Avatar[] = AVATARS): Avatar {
  return avatars[index] ?? avatars[0];
}

export function Face({ avatar, size }: { avatar: Avatar; size: number }) {
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
