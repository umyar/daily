// Production. Vercel Functions share no memory between invocations, so the room
// lives in Redis and the compare-and-swap has to be genuinely atomic.

import { Redis } from '@upstash/redis'
import { missingState, ROOM_TTL_SECONDS, type RoomState } from './roomState.ts'
import type { Store } from './roomApi.ts'

// Runs server-side inside Redis, so the read of `version` and the write that
// depends on it can't be interleaved by another request.
const CAS = `
local current = redis.call('HGET', KEYS[1], 'version')
if current == false then
  if ARGV[1] ~= '0' then return 0 end
else
  if current ~= ARGV[1] then return 0 end
end
redis.call('HSET', KEYS[1], 'state', ARGV[2], 'version', ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return 1
`

export function redisStore(): Store {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
  if (!url || !token) {
    throw new Error(
      'No Redis credentials. Add Upstash Redis from the Vercel dashboard (Storage tab) ' +
        'so UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set.',
    )
  }

  const redis = new Redis({ url, token })
  const key = (id: string) => `room:${id}`

  return {
    async read(id) {
      const stored = await redis.hget(key(id), 'state')
      if (stored === null || stored === undefined) return missingState()
      // The client decodes JSON for us when it recognises one; take either shape.
      return typeof stored === 'string' ? (JSON.parse(stored) as RoomState) : (stored as RoomState)
    },

    async write(id, expectedVersion, next) {
      const ok = await redis.eval(
        CAS,
        [key(id)],
        [String(expectedVersion), JSON.stringify(next), String(next.version), String(ROOM_TTL_SECONDS)],
      )
      // Redis replies with an integer, but it crosses a REST boundary to get here.
      return Number(ok) === 1
    },
  }
}
