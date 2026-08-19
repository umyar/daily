// The shape of a session and the only place it is allowed to change. Shared by
// the client (types), the Vercel function, and the local dev server.

export type Question = { id: string; text: string }

// 'missing' is a room nobody has opened (or one that has already expired) —
// distinct from 'closed', which the host ended deliberately.
export type SessionStatus = 'missing' | 'open' | 'closed'

export type RoomState = {
  status: SessionStatus
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
  | { type: 'close' }

const ROOM_ID = /^[A-Z0-9]{6}$/
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no O/0, no I/1
const MAX_QUESTIONS = 100
const MAX_TEXT = 500

export const ROOM_TTL_SECONDS = 30 * 60

export function isRoomId(id: string): boolean {
  return ROOM_ID.test(id)
}

export function newRoomId(): string {
  let id = ''
  for (let i = 0; i < 6; i++) id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]
  return id
}

export function missingState(): RoomState {
  return { status: 'missing', questions: [], drawnIds: [], started: false, version: 0 }
}

export function openState(): RoomState {
  return { status: 'open', questions: [], drawnIds: [], started: false, version: 0 }
}

// Returns null when the action changes nothing, so the version only moves on
// real edits and polling clients aren't woken for nothing.
export function reduce(state: RoomState, action: Action): RoomState | null {
  // A session that was never opened, or that the host ended, takes no edits.
  if (state.status !== 'open') return null

  switch (action.type) {
    case 'add': {
      const text = action.text.trim().slice(0, MAX_TEXT)
      if (!text || state.started || state.questions.length >= MAX_QUESTIONS) return null
      return { ...state, questions: [...state.questions, { id: crypto.randomUUID(), text }] }
    }

    case 'remove': {
      if (state.started) return null
      const questions = state.questions.filter((question) => question.id !== action.id)
      if (questions.length === state.questions.length) return null
      return { ...state, questions }
    }

    case 'start': {
      if (state.started || !state.questions.length) return null
      return { ...state, started: true }
    }

    // `expect` is the draw count the clicker believed was current. If someone
    // else's click landed first it won't match, and this one is dropped instead
    // of burning a second question.
    case 'draw': {
      if (!state.started || action.expect !== state.drawnIds.length) return null
      const pool = state.questions.filter((question) => !state.drawnIds.includes(question.id))
      if (!pool.length) return null
      const winner = pool[Math.floor(Math.random() * pool.length)]
      return { ...state, drawnIds: [...state.drawnIds, winner.id] }
    }

    case 'reset': {
      if (!state.started && !state.questions.length) return null
      return { ...openState(), version: state.version }
    }

    // Host only — the gate lives in roomApi, since a pure reducer has no
    // business knowing about credentials.
    case 'close': {
      return { ...state, status: 'closed' }
    }

    default:
      return null
  }
}

export function parseAction(body: unknown): Action | null {
  if (typeof body !== 'object' || body === null) return null
  const action = body as Record<string, unknown>
  switch (action.type) {
    case 'add':
      return typeof action.text === 'string' ? { type: 'add', text: action.text } : null
    case 'remove':
      return typeof action.id === 'string' ? { type: 'remove', id: action.id } : null
    case 'start':
      return { type: 'start' }
    case 'draw':
      return Number.isInteger(action.expect)
        ? { type: 'draw', expect: action.expect as number }
        : null
    case 'reset':
      return { type: 'reset' }
    case 'close':
      return { type: 'close' }
    default:
      return null
  }
}
