// The server owns the session; this module is the wire to it.

export type Question = { id: string; text: string }

export type RoomState = {
  questions: Question[]
  drawnIds: string[]
  started: boolean
  version: number
}

export type Action =
  | { type: 'add'; text: string }
  | { type: 'remove'; id: string }
  | { type: 'start' }
  | { type: 'draw'; expect: number }
  | { type: 'reset' }

export const POLL_INTERVAL = 1000

export const emptyState: RoomState = {
  questions: [],
  drawnIds: [],
  started: false,
  version: -1,
}

export function roomIdFromPath(): string | null {
  const match = /^\/r\/([A-Z0-9]{6})$/.exec(window.location.pathname)
  return match ? match[1] : null
}

export async function createRoom(): Promise<string> {
  const response = await fetch('/api/room', { method: 'POST' })
  if (!response.ok) throw new Error(`create room failed: ${response.status}`)
  const body = (await response.json()) as { id: string }
  return body.id
}

// Resolves to null when the server has nothing newer than `since`.
export async function fetchState(id: string, since: number): Promise<RoomState | null> {
  const response = await fetch(`/api/room/${id}?since=${since}`)
  if (response.status === 204) return null
  if (!response.ok) throw new Error(`fetch failed: ${response.status}`)
  return (await response.json()) as RoomState
}

export async function sendAction(id: string, action: Action): Promise<RoomState> {
  const response = await fetch(`/api/room/${id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(action),
  })
  if (!response.ok) throw new Error(`action failed: ${response.status}`)
  return (await response.json()) as RoomState
}
