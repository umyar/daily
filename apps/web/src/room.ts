// The server owns the session; this module is the wire to it.

export type { Question, RoomState, Action, SessionStatus } from '../lib/roomState.js'

import type { Action, RoomState } from '../lib/roomState.js'

const PASSWORD_HEADER = 'x-daily-host'
const TOKEN_HEADER = 'x-daily-token'
const TOKEN_KEY = 'daily-host-token'

export const POLL_INTERVAL = 1000

// version -1 means "we have not heard from the server yet", which is distinct
// from a real room sitting at version 0.
export const unknownState: RoomState = {
  status: 'missing',
  questions: [],
  drawnIds: [],
  started: false,
  version: -1,
}

export function roomIdFromPath(): string | null {
  const match = /^\/r\/([A-Z0-9]{6})$/.exec(window.location.pathname)
  return match ? match[1] : null
}

export type HostToken = { token: string; expiresAt: number }

// The password is never stored — only the short-lived token it buys. An expired
// token is kept rather than deleted: it is useless as a credential but still
// tells us this device is the host's, so we know to offer the re-auth prompt
// instead of hiding the controls as if this were a participant.
export function savedToken(): HostToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<HostToken>
    if (typeof parsed.token !== 'string' || typeof parsed.expiresAt !== 'number') return null
    return { token: parsed.token, expiresAt: parsed.expiresAt }
  } catch {
    return null
  }
}

export function rememberToken(token: HostToken) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token))
}

export function forgetToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function tokenIsFresh(token: HostToken | null): token is HostToken {
  return Boolean(token) && Date.now() < token!.expiresAt
}

export class WrongPassword extends Error {}
export class NeedsPassword extends Error {}

export async function authenticate(password: string): Promise<HostToken> {
  const response = await fetch('/api/session', {
    method: 'POST',
    headers: { [PASSWORD_HEADER]: password },
  })
  if (response.status === 401) throw new WrongPassword('wrong password')
  if (!response.ok) throw new Error(`could not authenticate: ${response.status}`)
  return (await response.json()) as HostToken
}

export async function openSession(token: string): Promise<string> {
  const response = await fetch('/api/room', {
    method: 'POST',
    headers: { [TOKEN_HEADER]: token },
  })
  if (response.status === 401) throw new NeedsPassword('token rejected')
  if (!response.ok) throw new Error(`could not start session: ${response.status}`)
  const body = (await response.json()) as { id: string }
  return body.id
}

export async function closeSession(id: string, token: string): Promise<RoomState> {
  const response = await fetch(`/api/room?id=${id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [TOKEN_HEADER]: token },
    body: JSON.stringify({ type: 'close' }),
  })
  if (response.status === 401) throw new NeedsPassword('token rejected')
  if (!response.ok) throw new Error(`could not end session: ${response.status}`)
  return (await response.json()) as RoomState
}

// Resolves to null when the server has nothing newer than `since`.
export async function fetchState(id: string, since: number): Promise<RoomState | null> {
  const response = await fetch(`/api/room?id=${id}&since=${since}`)
  if (response.status === 204) return null
  if (!response.ok) throw new Error(`fetch failed: ${response.status}`)
  return (await response.json()) as RoomState
}

export async function sendAction(id: string, action: Action): Promise<RoomState> {
  const response = await fetch(`/api/room?id=${id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(action),
  })
  if (!response.ok) throw new Error(`action failed: ${response.status}`)
  return (await response.json()) as RoomState
}
