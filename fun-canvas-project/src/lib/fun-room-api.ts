// Stub API. The real version will call Drupal endpoints:
//   GET  /api/fun/rooms/{code}
//   POST /api/fun/rooms/{code}/join
// Keep every network call in this module so the port to Canvas only swaps this file.

export type Room = {
  code: string;
  status: 'open' | 'closed';
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

const STUB_ROOMS: Record<string, Room> = {
  'NED-4261': { code: 'NED-4261', status: 'open', currentSlide: 5 },
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function getRoom(code: string): Promise<Room> {
  await wait(350);
  const room = STUB_ROOMS[code.trim().toUpperCase()];
  if (!room) throw new Error('not_found');
  if (room.status !== 'open') throw new Error('closed');
  return room;
}

export async function join(
  code: string,
  profile: Profile,
): Promise<JoinResult> {
  await wait(450);
  const room = await getRoom(code);
  return {
    room,
    participant: {
      ...profile,
      token: `stub-${Math.random().toString(36).slice(2)}`,
    },
  };
}
