import { cn } from 'drupal-canvas';

type PlaceholderProps = {
  title: string;
  description?: string;
  className?: string;
};

// A clearly marked spot for a feature whose backend is not built yet. Swap the
// placeholder for the real component in the room template when it lands.
export default function Placeholder({
  title,
  description,
  className,
}: PlaceholderProps) {
  return (
    <section
      className={cn(
        'rounded-3xl border-2 border-dashed border-ink/40 bg-white/60 p-5 text-ink',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 font-display text-xl font-extrabold">{title}</h2>
        <span className="rounded-full bg-ink px-3 py-1 text-xs font-bold tracking-wide text-white uppercase">
          Coming soon
        </span>
      </div>
      {description ? (
        <p className="m-0 mt-2 text-base leading-snug">{description}</p>
      ) : null}
    </section>
  );
}
