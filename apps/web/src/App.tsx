import { useEffect, useState } from 'react'
import { Collect } from './Collect'
import { Draw } from './Draw'
import { ThemeToggle } from './ThemeToggle'
import { playClick } from './sounds'
import { applyTheme, loadTheme, type Theme } from './theme'
import { emptySession, loadSession, newQuestion, saveSession, type Session } from './session'
import './App.css'

export default function App() {
  const [session, setSession] = useState<Session>(loadSession)
  const [theme, setTheme] = useState<Theme>(loadTheme)

  useEffect(() => {
    saveSession(session)
  }, [session])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // One listener beats threading a click sound through every button.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.target instanceof Element && event.target.closest('button')) playClick()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  function addQuestion(text: string) {
    setSession((prev) => ({ ...prev, questions: [...prev.questions, newQuestion(text)] }))
  }

  function removeQuestion(id: string) {
    setSession((prev) => ({
      ...prev,
      questions: prev.questions.filter((question) => question.id !== id),
    }))
  }

  function start() {
    setSession((prev) => ({ ...prev, started: true }))
  }

  function draw(id: string) {
    setSession((prev) => ({ ...prev, drawnIds: [...prev.drawnIds, id] }))
  }

  function reset() {
    setSession(emptySession)
  }

  return (
    <main className="app">
      <ThemeToggle theme={theme} onChange={setTheme} />
      {session.started ? (
        <Draw
          questions={session.questions}
          drawnIds={session.drawnIds}
          onDraw={draw}
          onReset={reset}
        />
      ) : (
        <Collect
          questions={session.questions}
          onAdd={addQuestion}
          onRemove={removeQuestion}
          onDone={start}
        />
      )}
    </main>
  )
}
