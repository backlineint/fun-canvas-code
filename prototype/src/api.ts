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
  'NED-4261': { id: 'stub-room', code: 'NED-4261', status: 'open', currentSlide: 4 },
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const ROOM_TYPE = 'fun_room--fun_room';
const PARTICIPANT_TYPE = 'fun_participant--fun_participant';

type Resource = { id: string; attributes: Record<string, unknown> };

async function getRoomFromSite(code: string): Promise<Room> {
  const query = new URLSearchParams({ 'filter[code]': code.trim().toUpperCase() });
  const response = await fetch(`${API}/jsonapi/fun_room/fun_room?${query}`, {
    headers: { Accept: 'application/vnd.api+json' },
  });
  if (!response.ok) throw new Error('unavailable');

  const { data } = (await response.json()) as { data: Resource[] };
  if (data.length === 0) throw new Error('not_found');

  const [resource] = data;
  const room: Room = {
    id: resource.id,
    code: String(resource.attributes.code),
    status: resource.attributes.status === 'closed' ? 'closed' : 'open',
    currentSlide: Number(resource.attributes.current_slide ?? 0),
  };
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
