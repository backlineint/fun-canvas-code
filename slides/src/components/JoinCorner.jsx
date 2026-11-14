import { roomCode } from '../room.js';
import qr from '../assets/join-qr.svg';

// A small reminder of how to join, shown in the corner of every slide after the join slide.
export default function JoinCorner() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/90 p-2 pr-5 shadow-lg">
      <img src={qr} alt="QR code to join the room" className="h-[88px] w-[88px] rounded-lg" />
      <div className="text-left leading-tight">
        <div className="font-display text-base font-extrabold tracking-wide text-ink/70 uppercase">
          Join Room
        </div>
        <div className="font-display text-3xl font-extrabold tracking-widest text-ink">{roomCode}</div>
      </div>
    </div>
  );
}
