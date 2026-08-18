export type Question = { id: string; text: string }

export type Session = {
  questions: Question[]
  drawnIds: string[]
  started: boolean
}

const STORAGE_KEY = 'scrum-daily-session-v1'

export const emptySession: Session = { questions: [], drawnIds: [], started: false }

export function loadSession(): Session {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptySession
    const parsed = JSON.parse(raw) as Partial<Session>
    if (!Array.isArray(parsed.questions) || !Array.isArray(parsed.drawnIds)) return emptySession
    return {
      questions: parsed.questions,
      drawnIds: parsed.drawnIds,
      started: Boolean(parsed.started),
    }
  } catch {
    return emptySession
  }
}

export function saveSession(session: Session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function newQuestion(text: string): Question {
  return { id: crypto.randomUUID(), text }
}
