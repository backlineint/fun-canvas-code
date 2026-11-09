// The live half of a room: reading the swarm, sending the attendee's fun level, and
// the room's comments.
//   GET  {base}/api/fun/rooms/{code}/state
//   POST {base}/api/fun/rooms/{code}/vote   { value }   header X-Participant-Token
//   GET  {base}/api/fun/rooms/{code}/comments?after={id}&limit={n}
//   POST {base}/api/fun/rooms/{code}/comments   { text }   header X-Participant-Token
// These are plain fetch calls (not JSON:API). `base` is the site's address from
// `useSiteContext().baseUrl`, which is the site itself on a Drupal page and the
// connected site in Workbench. Keep every call to these endpoints in this module.

export type Dot = {
  /** Opaque and stable, so a dot keeps its place between polls. */
  id: string;
  /** The fun level, 0 to 100. */
  x: number;
  /** Vertical place, 8 to 92 percent from the top. */
  y: number;
  /** Index into the avatar list, which gives the dot its color. */
  avatar: number;
};

export type Tier = 'low' | 'mid' | 'high';

export type SwarmState = {
  code: string;
  status: 'open' | 'closed';
  /** Zero-based index of the slide being shown. */
  slide: number;
  /** Everyone who joined. */
  count: number;
  /** Those who have moved the slider (and so have a dot). */
  voters: number;
  median: number | null;
  tier: Tier | null;
  dots: Dot[];
  updated: number;
};

export type VoteResult = {
  /** The attendee's own dot id, to find it in the swarm. */
  id: string;
  value: number;
  slide: number;
};

/** A failed vote. `reason` is the server's error code, or "network". */
export class VoteError extends Error {
  readonly status: number;
  readonly reason: string;

  constructor(status: number, reason: string) {
    super(`vote failed: ${reason}`);
    this.status = status;
    this.reason = reason;
  }
}

const endpoint = (base: string, code: string, name: string) =>
  `${base.replace(/\/+$/, '')}/api/fun/rooms/${encodeURIComponent(code.trim().toUpperCase())}/${name}`;

export async function fetchSwarm(
  base: string,
  code: string,
): Promise<SwarmState> {
  const response = await fetch(endpoint(base, code, 'state'), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`swarm failed: ${response.status}`);
  return (await response.json()) as SwarmState;
}

export async function sendVote(
  base: string,
  code: string,
  token: string,
  value: number,
): Promise<VoteResult> {
  let response: Response;
  try {
    response = await fetch(endpoint(base, code, 'vote'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Participant-Token': token,
      },
      body: JSON.stringify({ value }),
    });
  } catch {
    throw new VoteError(0, 'network');
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new VoteError(response.status, body.error ?? 'error');
  }
  return (await response.json()) as VoteResult;
}

export type Comment = {
  /** Rises with every comment, so a poller can ask for "after" the last one it has. */
  id: number;
  name: string;
  /** Index into the avatar list. */
  avatar: number;
  /** Zero-based index of the slide showing when it was posted. */
  slide: number;
  slideTitle: string;
  /** Plain text. Always render it as text, never as HTML. */
  text: string;
  /** ISO 8601 UTC time. */
  at: string;
};

/** A failed comment. `reason` is the server's error code, or "network". */
export class CommentError extends Error {
  readonly status: number;
  readonly reason: string;

  constructor(status: number, reason: string) {
    super(`comment failed: ${reason}`);
    this.status = status;
    this.reason = reason;
  }
}

/** The room's comments, oldest first. With `after`, only those newer than that id. */
export async function fetchComments(
  base: string,
  code: string,
  after = 0,
): Promise<Comment[]> {
  const query = after > 0 ? `?after=${after}` : '';
  const response = await fetch(`${endpoint(base, code, 'comments')}${query}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`comments failed: ${response.status}`);
  return ((await response.json()) as { comments: Comment[] }).comments;
}

export async function sendComment(
  base: string,
  code: string,
  token: string,
  text: string,
): Promise<Comment> {
  let response: Response;
  try {
    response = await fetch(endpoint(base, code, 'comments'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Participant-Token': token,
      },
      body: JSON.stringify({ text }),
    });
  } catch {
    throw new CommentError(0, 'network');
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new CommentError(response.status, body.error ?? 'error');
  }
  return (await response.json()) as Comment;
}
