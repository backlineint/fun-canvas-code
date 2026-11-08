// Room API for the standalone prototype. With VITE_ROOM_API unset it uses a
// stub (one room, NED-4261). With it set to the Drupal site origin, for example
//   VITE_ROOM_API=https://fun-canvas-code.ddev.site pnpm dev
// it talks to the `fun_room` module's JSON:API endpoints, the same ones the
// Canvas component uses (fun-canvas-project/src/lib/fun-room-api.ts).
// Keep every network call in this module.

export type Room = {
  /** JSON:API resource id (uuid), needed to relate a participant to the room. */
  id: string;
  code: string;
  status: 'open' | 'closed';
  /** Zero-based slide index, as reported by the deck. Show it as index + 1. */
  currentSlide: number;
  /** The room page's path: its alias, such as /room/ned-4261, else /node/{nid}. */
  path: string;
};

export type Profile = {
  name: string;
  avatar: number;
};

export type JoinResult = {
  room: Room;
  participant: Profile & { token: string };
};

const API = (import.meta.env.VITE_ROOM_API as string | undefined)?.replace(/\/+$/, '');

const STUB_ROOMS: Record<string, Room> = {
  'NED-4261': { id: 'stub-room', code: 'NED-4261', status: 'open', currentSlide: 4, path: '/room/ned-4261' },
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const ROOM_TYPE = 'node--room';
const PARTICIPANT_TYPE = 'fun_participant--fun_participant';

type Resource = { id: string; attributes: Record<string, unknown> };

// A room is a node of type `room`; its title is the room code.
function toRoom({ id, attributes }: Resource): Room {
  const alias = (attributes.path as { alias?: string } | null)?.alias;
  return {
    id,
    code: String(attributes.title),
    status: attributes.field_status === 'closed' ? 'closed' : 'open',
    currentSlide: Number(attributes.field_current_slide ?? 0),
    path: alias || `/node/${String(attributes.drupal_internal__nid)}`,
  };
}

async function getRoomFromSite(code: string): Promise<Room> {
  const query = new URLSearchParams({ 'filter[title]': code.trim().toUpperCase() });
  const response = await fetch(`${API}/jsonapi/node/room?${query}`, {
    headers: { Accept: 'application/vnd.api+json' },
  });
  if (!response.ok) throw new Error('unavailable');

  const { data } = (await response.json()) as { data: Resource[] };
  if (data.length === 0) throw new Error('not_found');

  const room = toRoom(data[0]);
  if (room.status === 'closed') throw new Error('closed');
  return room;
}

// 24 random bytes as hex. The server stores only a SHA-256 of this secret.
function newToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function joinOnSite(code: string, profile: Profile): Promise<JoinResult> {
  const room = await getRoomFromSite(code);
  const token = newToken();

  const response = await fetch(`${API}/jsonapi/fun_participant/fun_participant`, {
    method: 'POST',
    headers: { Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json' },
    body: JSON.stringify({
      data: {
        type: PARTICIPANT_TYPE,
        attributes: { name: profile.name, avatar: profile.avatar, token },
        relationships: { room: { data: { type: ROOM_TYPE, id: room.id } } },
      },
    }),
  });

  if (response.status === 429) throw new Error('rate_limited');
  if (response.status !== 201) throw new Error('join_failed');
  return { room, participant: { ...profile, token } };
}

export async function getRoom(code: string): Promise<Room> {
  if (API) return getRoomFromSite(code);

  await wait(350);
  const room = STUB_ROOMS[code.trim().toUpperCase()];
  if (!room) throw new Error('not_found');
  if (room.status !== 'open') throw new Error('closed');
  return room;
}

export async function join(code: string, profile: Profile): Promise<JoinResult> {
  if (API) return joinOnSite(code, profile);

  await wait(450);
  const room = await getRoom(code);
  return {
    room,
    participant: { ...profile, token: `stub-${Math.random().toString(36).slice(2)}` },
  };
}
