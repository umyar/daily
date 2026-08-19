// Production. Vercel Functions share no memory between invocations, so the room
// lives in Redis and the compare-and-swap has to be genuinely atomic.

import { Redis } from '@upstash/redis'
import { envEndingWith, envNames } from './env.js'
import { missingState, ROOM_TTL_SECONDS, type RoomState } from './roomState.js'
import type { Store } from './roomApi.js'

const URL_ENDINGS = ['UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL', 'REDIS_REST_URL']
const TOKEN_ENDINGS = ['UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN', 'REDIS_REST_TOKEN']

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
  const url = envEndingWith(URL_ENDINGS)
  const token = envEndingWith(TOKEN_ENDINGS)
  if (!url || !token) throw new Error(describeMissing(url, token))

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
        [
          String(expectedVersion),
          JSON.stringify(next),
          String(next.version),
          String(ROOM_TTL_SECONDS),
        ],
      )
      // Redis replies with an integer, but it crosses a REST boundary to get here.
      return Number(ok) === 1
    },
  }
}

// Names only, and only Redis-ish ones — enough to see what an integration
// actually injected without printing anything sensitive on a public endpoint.
function describeMissing(url: string | undefined, token: string | undefined): string {
  const related = envNames().filter((name) => /REDIS|UPSTASH|\bKV_/.test(name))
  const missing = [!url && 'REST URL', !token && 'REST token'].filter(Boolean).join(' and ')

  if (!related.length) {
    return (
      `No Redis credentials (missing ${missing}), and no Redis-related environment ` +
      `variable is set at all. Add Upstash Redis from the Vercel dashboard (Storage tab), ` +
      `then redeploy so the function picks the values up.`
    )
  }

  return (
    `No Redis credentials (missing ${missing}). These Redis-related variables are set: ` +
    `${related.join(', ')}. This app needs the REST API pair — a name ending in one of ` +
    `${URL_ENDINGS.join('/')} and one ending in ${TOKEN_ENDINGS.join('/')}. A redis:// ` +
    `connection string alone will not work; the REST URL and token are separate values ` +
    `on the Upstash database page.`
  )
}
