// Room API over Drupal JSON:API (the `fun_room` module on the site):
//   GET  /jsonapi/fun_room/fun_room?filter[code]=NED-4261
//   POST /jsonapi/fun_participant/fun_participant
// Keep every network call in this module. The caller passes in the client from
// `useJsonApiClient()` because that is a hook and can only be used in a component.

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

/**
 * The part of the JSON:API client this module uses. `useJsonApiClient()`
 * returns `null` when no client is configured.
 */
export type RoomClient = {
  getCollection: (
    type: string,
    options?: { queryString?: string; disableCache?: boolean },
  ) => Promise<unknown>;
  createResource: (
    type: string,
    body: object,
    options?: { rawResponse?: boolean; disableCache?: boolean },
  ) => Promise<unknown>;
};

const ROOM_TYPE = 'fun_room--fun_room';
const PARTICIPANT_TYPE = 'fun_participant--fun_participant';

type Resource = Record<string, unknown> & {
  id?: string;
  attributes?: Record<string, unknown>;
};

// The Canvas client returns deserialized (flattened) resources; plain JSON:API
// documents nest fields under `attributes`. Accept both.
function field(resource: Resource, name: string): unknown {
  return resource.attributes?.[name] ?? resource[name];
}

function toRoom(resource: Resource): Room {
  return {
    id: String(resource.id ?? ''),
    code: String(field(resource, 'code') ?? ''),
    status: field(resource, 'status') === 'closed' ? 'closed' : 'open',
    currentSlide: Number(field(resource, 'current_slide') ?? 0),
  };
}

function requireClient(client: RoomClient | null): RoomClient {
  if (!client) throw new Error('unavailable');
  return client;
}

export async function getRoom(
  client: RoomClient | null,
  code: string,
): Promise<Room> {
  const query = new URLSearchParams({
    'filter[code]': code.trim().toUpperCase(),
  });
  const result = await requireClient(client).getCollection(ROOM_TYPE, {
    queryString: query.toString(),
    // A room can close at any time, so never serve a cached lookup.
    disableCache: true,
  });

  const resources = Array.isArray(result)
    ? result
    : ((result as { data?: Resource[] } | null)?.data ?? []);
  if (resources.length === 0) throw new Error('not_found');

  const room = toRoom(resources[0] as Resource);
  if (room.status === 'closed') throw new Error('closed');
  return room;
}

// 24 random bytes as hex. `getRandomValues` works in insecure contexts, unlike
// `randomUUID`. The server stores only a SHA-256 of this secret.
function newToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function join(
  client: RoomClient | null,
  code: string,
  profile: Profile,
): Promise<JoinResult> {
  const room = await getRoom(client, code);
  const token = newToken();

  const result = (await requireClient(client).createResource(
    PARTICIPANT_TYPE,
    {
      data: {
        type: PARTICIPANT_TYPE,
        attributes: { name: profile.name, avatar: profile.avatar, token },
        relationships: {
          room: { data: { type: ROOM_TYPE, id: room.id } },
        },
      },
    },
    // Raw mode exposes the HTTP status; the client does not throw on 4xx.
    { rawResponse: true, disableCache: true },
  )) as { response?: Response } | null;

  const status = result?.response?.status;
  if (status === 429) throw new Error('rate_limited');
  if (status !== 201) throw new Error('join_failed');

  return { room, participant: { ...profile, token } };
}
