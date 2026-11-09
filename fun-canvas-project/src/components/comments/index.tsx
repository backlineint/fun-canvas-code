import { useEffect, useRef, useState } from 'react';
import { avatarAt, Face } from '@/lib/fun-room-avatars';
import { CommentError, fetchComments, sendComment } from '@/lib/fun-room-live';
import {
  clearJoined,
  readMyComments,
  rememberComment,
  useJoined,
} from '@/lib/fun-room-session';
import { cn } from 'drupal-canvas';
import { useSiteContext } from 'drupal-canvas/react';
import useSWR from 'swr';
import type { FormEvent, KeyboardEvent } from 'react';
import type { Comment } from '@/lib/fun-room-live';

type CommentsProps = {
  code: string;
  pollMs?: number;
  className?: string;
};

/** The longest comment, in characters. The server enforces the same limit. */
const MAX_LENGTH = 280;

type Problem = 'closed' | 'lost' | null;

// What an attendee sees of a comment still on its way to the server.
type Pending = { key: number; text: string };

// Comments from the room, newest first, and a box to add one. A comment appears at
// once when sent and is swapped for the server's copy when it arrives. New comments
// from others arrive by polling for "after the last id I have". Comment text is
// rendered as text only, so markup in a comment shows as typed.
export default function Comments({
  code,
  pollMs = 3000,
  className,
}: CommentsProps) {
  const base = useSiteContext()?.baseUrl ?? '';
  const joined = useJoined();
  const me =
    joined && joined.roomCode.toUpperCase() === code.toUpperCase()
      ? joined.participant
      : null;

  const [comments, setComments] = useState<Comment[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [mine, setMine] = useState<number[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const [notice, setNotice] = useState('');
  const lastId = useRef(0);
  const pendingKey = useRef(0);

  // Which comments are this browser's own (read after mount: server render has no storage).
  useEffect(() => setMine(readMyComments(code)), [code]);

  const add = (incoming: Comment[]) => {
    if (incoming.length === 0) return;
    setComments((current) => {
      const known = new Set(current.map((comment) => comment.id));
      const merged = [
        ...current,
        ...incoming.filter((comment) => !known.has(comment.id)),
      ].sort((a, b) => a.id - b.id);
      return merged.slice(-100);
    });
    lastId.current = Math.max(lastId.current, ...incoming.map((c) => c.id));
  };

  const { error } = useSWR(
    code ? ['fun-comments', base, code] : null,
    () => fetchComments(base, code, lastId.current),
    {
      refreshInterval: pollMs,
      dedupingInterval: 0,
      onSuccess: add,
    },
  );

  const typed = Array.from(text).length;
  const tooLong = typed > MAX_LENGTH;
  const disabled = !me || problem !== null;
  const canSend = !disabled && !sending && text.trim() !== '' && !tooLong;

  async function send() {
    if (!canSend || !me) return;
    const body = text;
    const key = ++pendingKey.current;
    setPending((current) => [...current, { key, text: body.trim() }]);
    setText('');
    setSending(true);
    setNotice('');
    try {
      const saved = await sendComment(base, code, me.token, body);
      rememberComment(code, saved.id);
      setMine((current) => [...current, saved.id]);
      add([saved]);
    } catch (e) {
      const status = e instanceof CommentError ? e.status : 0;
      if (status === 403) {
        clearJoined();
        setProblem('lost');
      } else if (status === 409) {
        setProblem('closed');
      } else if (status === 429) {
        setNotice('Slow down a little, then try again.');
      } else if (status === 422) {
        setNotice("That comment can't be sent.");
      } else {
        setNotice("Couldn't send that. Try again.");
      }
      // Give them their words back unless they have started something new.
      setText((current) => (current === '' ? body : current));
    } finally {
      setPending((current) => current.filter((item) => item.key !== key));
      setSending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void send();
    }
  }

  const ready = joined !== undefined;
  const shown = [...comments].reverse();

  return (
    <section
      className={cn(
        'flex h-full min-h-80 flex-col gap-3 rounded-3xl bg-white p-5 text-ink lg:min-h-0',
        className,
      )}
    >
      <h2 className="m-0 font-display text-xl font-extrabold">Comments</h2>

      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <label htmlFor={`comment-${code}`} className="text-sm font-bold">
          Say something to the room
        </label>
        <textarea
          id={`comment-${code}`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          rows={2}
          aria-describedby={`comment-help-${code}`}
          className="min-h-16 w-full resize-none rounded-2xl border-2 border-ink/30 bg-white p-3 text-base text-ink focus:border-ink focus:outline-none disabled:cursor-not-allowed disabled:bg-ink/5"
        />
        <div className="flex items-center justify-between gap-3">
          <span
            id={`comment-help-${code}`}
            className={cn('text-sm font-bold', tooLong && 'text-[#b00020]')}
          >
            {typed} / {MAX_LENGTH}
          </span>
          <button
            type="submit"
            disabled={!canSend}
            className="min-h-11 rounded-full bg-ink px-6 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>

      <p role="status" className="m-0 min-h-5 text-sm font-bold">
        {problem === 'closed' ? (
          'This room has closed.'
        ) : problem === 'lost' ? (
          <>
            We lost track of you.{' '}
            <a
              href={`/?code=${encodeURIComponent(code)}`}
              className="underline"
            >
              Join the room again
            </a>
            .
          </>
        ) : notice ? (
          notice
        ) : error ? (
          "We can't reach the room right now. Retrying."
        ) : ready && !me ? (
          <>
            Join this room to comment.{' '}
            <a
              href={`/?code=${encodeURIComponent(code)}`}
              className="underline"
            >
              Join
            </a>
          </>
        ) : null}
      </p>

      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Comments"
        className="flex max-h-[28rem] min-h-0 flex-1 flex-col gap-2 overflow-y-auto lg:max-h-none"
      >
        {pending.map((item) => (
          <article
            key={`pending-${item.key}`}
            className="flex gap-3 rounded-2xl bg-mood-field p-3 opacity-60"
          >
            {me ? <Face avatar={avatarAt(me.avatar)} size={28} /> : null}
            <p className="m-0 text-base [overflow-wrap:anywhere]">
              {item.text}
            </p>
          </article>
        ))}
        {shown.map((comment) => (
          <article
            key={comment.id}
            className={cn(
              'flex gap-3 rounded-2xl p-3 motion-safe:animate-[comment-in_0.4s_ease-out]',
              mine.includes(comment.id) ? 'bg-mood-field' : 'bg-ink/5',
            )}
          >
            <Face avatar={avatarAt(comment.avatar)} size={28} />
            <div className="min-w-0">
              <div className="text-sm font-bold">
                {comment.name}
                {mine.includes(comment.id) ? ' (you)' : ''}
                <span
                  className="font-medium"
                  title={comment.slideTitle || undefined}
                >
                  {' '}
                  · slide {comment.slide + 1}
                </span>
              </div>
              <p className="m-0 text-base [overflow-wrap:anywhere]">
                {comment.text}
              </p>
            </div>
          </article>
        ))}
        {shown.length === 0 && pending.length === 0 ? (
          <p className="m-0 text-base">No comments yet. Be the first.</p>
        ) : null}
      </div>
    </section>
  );
}
