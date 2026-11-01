// Stub API. The real version will call Drupal endpoints:
//   GET  /api/fun/rooms/{code}
//   POST /api/fun/rooms/{code}/join
// Keep every network call in this module so the port to Canvas only swaps this file.

const STUB_ROOMS = {
  'NED-4261': { code: 'NED-4261', status: 'open', currentSlide: 5 },
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getRoom(code) {
  await wait(350);
  const room = STUB_ROOMS[code.trim().toUpperCase()];
  if (!room) throw new Error('not_found');
  if (room.status !== 'open') throw new Error('closed');
  return room;
}

export async function join(code, profile) {
  await wait(450);
  const room = await getRoom(code);
  return {
    room,
    participant: { ...profile, token: `stub-${Math.random().toString(36).slice(2)}` },
  };
}
