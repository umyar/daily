// The authoritative copy of every live session. Clients render what this says.

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

const ROOM_ID = /^[A-Z0-9]{6}$/
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no O/0, no I/1
const MAX_QUESTIONS = 100
const MAX_TEXT = 500
const ROOM_TTL = 12 * 60 * 60 * 1000
const SWEEP_EVERY = 30 * 60 * 1000

const rooms = new Map<string, { state: RoomState; touched: number }>()

export function isRoomId(id: string): boolean {
  return ROOM_ID.test(id)
}

export function newRoomId(): string {
  let id = ''
  for (let i = 0; i < 6; i++) id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]
  return id
}

function emptyState(): RoomState {
  return { questions: [], drawnIds: [], started: false, version: 0 }
}

export function getRoom(id: string): RoomState {
  const existing = rooms.get(id)
  if (existing) {
    existing.touched = Date.now()
    return existing.state
  }
  const state = emptyState()
  rooms.set(id, { state, touched: Date.now() })
  return state
}

// Returns the room's state after the action. Unknown or no-op actions leave
// version untouched, so polling clients don't get woken for nothing.
export function apply(id: string, action: Action): RoomState {
  const state = getRoom(id)
  const next = reduce(state, action)
  if (!next) return state
  next.version = state.version + 1
  rooms.set(id, { state: next, touched: Date.now() })
  return next
}

function reduce(state: RoomState, action: Action): RoomState | null {
  switch (action.type) {
    case 'add': {
      const text = action.text.trim().slice(0, MAX_TEXT)
      if (!text || state.started || state.questions.length >= MAX_QUESTIONS) return null
      const question = { id: crypto.randomUUID(), text }
      return { ...state, questions: [...state.questions, question] }
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
      return { ...emptyState(), version: state.version }
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
    default:
      return null
  }
}

// Standups end; the Map shouldn't grow forever.
setInterval(() => {
  const cutoff = Date.now() - ROOM_TTL
  for (const [id, room] of rooms) if (room.touched < cutoff) rooms.delete(id)
}, SWEEP_EVERY).unref()
