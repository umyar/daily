// Only the host may open or end a session. The password is exchanged once for a
// signed, expiring token; it is never stored on the client and never reaches
// the client bundle, so `HOST_PASSWORD` must not carry a VITE_ prefix.

export const PASSWORD_HEADER = 'x-daily-host'
export const TOKEN_HEADER = 'x-daily-token'

// One working day: the host authenticates each morning, and a leaked token is
// worthless by the next standup.
export const TOKEN_TTL_MS = 8 * 60 * 60 * 1000

export function suppliedPassword(request: Request): string {
  return request.headers.get(PASSWORD_HEADER) ?? ''
}

export async function passwordMatches(supplied: string, expected: string | undefined) {
  if (!expected || !supplied) return false
  return equalInConstantTime(supplied, expected)
}

// The signing key is the password itself, so rotating it invalidates every
// outstanding token for free.
export async function issueToken(secret: string, now = Date.now()): Promise<string> {
  const payload = encode(JSON.stringify({ exp: now + TOKEN_TTL_MS }))
  return `${payload}.${await sign(payload, secret)}`
}

export async function isHost(request: Request, secret: string | undefined): Promise<boolean> {
  if (!secret) return false
  const token = request.headers.get(TOKEN_HEADER)
  if (!token) return false

  const [payload, signature] = token.split('.')
  if (!payload || !signature) return false
  if (!(await equalInConstantTime(signature, await sign(payload, secret)))) return false

  try {
    const { exp } = JSON.parse(decode(payload)) as { exp?: unknown }
    return typeof exp === 'number' && Date.now() < exp
  } catch {
    return false
  }
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return encodeBytes(new Uint8Array(mac))
}

// Hashing both sides first fixes the comparison at 32 bytes, so neither the
// length of the guess nor the position of the first wrong character is timeable.
async function equalInConstantTime(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([sha256(a), sha256(b)])
  let diff = 0
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i]
  return diff === 0
}

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return new Uint8Array(digest)
}

function encode(value: string): string {
  return encodeBytes(new TextEncoder().encode(value))
}

function encodeBytes(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)))
}
