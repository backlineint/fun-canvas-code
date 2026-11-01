import { roomCode } from '../room.js';

export default function RoomCode() {
  return (
    <div className="mx-auto mt-6 inline-block rounded-3xl bg-ink px-10 py-6 font-display text-8xl font-extrabold tracking-widest text-sun">
      {roomCode}
    </div>
  );
}
