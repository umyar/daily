// Local dev only. A single long-lived process, so a Map is enough and the
// version check never actually loses — Node serialises the requests for us.

import { missingState, ROOM_TTL_SECONDS, type RoomState } from './roomState.js'
import type { Store } from './roomApi.js'

const SWEEP_EVERY = 5 * 60 * 1000

export function memoryStore(): Store {
  const rooms = new Map<string, { state: RoomState; touched: number }>()

  // Redis drops a key the moment its TTL lapses, so expire on access rather
  // than waiting for the sweep. Otherwise a room outlives its lifetime here by
  // however long the sweep happens to be, and dev stops matching production.
  function live(id: string) {
    const room = rooms.get(id)
    if (!room) return undefined
    if (room.touched < Date.now() - ROOM_TTL_SECONDS * 1000) {
      rooms.delete(id)
      return undefined
    }
    return room
  }

  // Only reclaims memory for rooms nobody asks about again; correctness comes
  // from `live` above, so this cadence does not affect behaviour.
  setInterval(() => {
    for (const id of rooms.keys()) live(id)
  }, SWEEP_EVERY).unref()

  return {
    async read(id) {
      return live(id)?.state ?? missingState()
    },

    async write(id, expectedVersion, next) {
      const current = live(id)?.state.version ?? 0
      if (current !== expectedVersion) return false
      rooms.set(id, { state: next, touched: Date.now() })
      return true
    },
  }
}
