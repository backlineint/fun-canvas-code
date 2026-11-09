// One burst of confetti over the whole page, drawn on a throwaway canvas that
// ignores the pointer and is hidden from screen readers. Skipped for people who
// asked their device for less motion. The deck has a copy in slides/src/mood.js.

const PIECES = 140;
const DURATION_MS = 2800;

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  angle: number;
  color: string;
};

export function fireConfetti(colors: string[]): void {
  if (typeof document === 'undefined' || colors.length === 0) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483000';
  const ratio = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * ratio;
  canvas.height = window.innerHeight * ratio;
  const context = canvas.getContext('2d');
  if (!context) return;
  document.body.appendChild(canvas);
  context.scale(ratio, ratio);

  const width = window.innerWidth;
  const height = window.innerHeight;
  const pieces: Piece[] = Array.from({ length: PIECES }, (_, i) => ({
    // Two cannons from the bottom corners, aimed at the middle.
    x: i % 2 ? width * 0.05 : width * 0.95,
    y: height * 0.95,
    vx: (i % 2 ? 1 : -1) * (3 + Math.random() * 7),
    vy: -(9 + Math.random() * 11),
    size: 6 + Math.random() * 8,
    spin: (Math.random() - 0.5) * 0.4,
    angle: Math.random() * Math.PI,
    color: colors[i % colors.length],
  }));

  const start = performance.now();
  const frame = (now: number) => {
    const elapsed = now - start;
    context.clearRect(0, 0, width, height);
    context.globalAlpha = Math.max(
      0,
      Math.min(1, (DURATION_MS - elapsed) / 700),
    );
    for (const piece of pieces) {
      piece.vy += 0.3;
      piece.vx *= 0.99;
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.angle += piece.spin;
      context.save();
      context.translate(piece.x, piece.y);
      context.rotate(piece.angle);
      context.fillStyle = piece.color;
      context.fillRect(
        -piece.size / 2,
        -piece.size / 4,
        piece.size,
        piece.size / 2,
      );
      context.restore();
    }
    if (elapsed < DURATION_MS) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
