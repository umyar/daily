// Local dev only. A single long-lived process, so a Map is enough and the
// version check never actually loses — Node serialises the requests for us.

import { missingState, ROOM_TTL_SECONDS, type RoomState } from './roomState.js'
import type { Store } from './roomApi.js'

const SWEEP_EVERY = 30 * 60 * 1000

export function memoryStore(): Store {
  const rooms = new Map<string, { state: RoomState; touched: number }>()

  // Standups end; the Map shouldn't grow forever.
  setInterval(() => {
    const cutoff = Date.now() - ROOM_TTL_SECONDS * 1000
    for (const [id, room] of rooms) if (room.touched < cutoff) rooms.delete(id)
  }, SWEEP_EVERY).unref()

  return {
    async read(id) {
      const room = rooms.get(id)
      if (!room) return missingState()
      room.touched = Date.now()
      return room.state
    },

    async write(id, expectedVersion, next) {
      const current = rooms.get(id)?.state.version ?? 0
      if (current !== expectedVersion) return false
      rooms.set(id, { state: next, touched: Date.now() })
      return true
    },
  }
}
