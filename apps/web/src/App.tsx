import { useCallback, useEffect, useRef, useState } from 'react'
import { Collect } from './Collect'
import { Draw } from './Draw'
import { Logo } from './Logo'
import { RoomBar } from './RoomBar'
import { ThemeToggle } from './ThemeToggle'
import { playClick } from './sounds'
import { applyTheme, loadTheme, type Theme } from './theme'
import {
  createRoom,
  emptyState,
  fetchState,
  POLL_INTERVAL,
  roomIdFromPath,
  sendAction,
  type Action,
  type RoomState,
} from './room'
import './App.css'

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(roomIdFromPath)
  const [state, setState] = useState<RoomState>(emptyState)
  const [online, setOnline] = useState(true)
  const [theme, setTheme] = useState<Theme>(loadTheme)

  const version = useRef(emptyState.version)
  // Bumped around every action so a poll that was already in flight can't
  // overwrite the fresher state the action just returned.
  const epoch = useRef(0)

  const applyState = useCallback((next: RoomState) => {
    version.current = next.version
    setState(next)
  }, [])

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

  // No room in the URL means this is a fresh visit: claim one and show it.
  useEffect(() => {
    if (roomId) return
    let cancelled = false
    createRoom()
      .then((id) => {
        if (cancelled) return
        window.history.replaceState(null, '', `/r/${id}`)
        setRoomId(id)
      })
      .catch(() => setOnline(false))
    return () => {
      cancelled = true
    }
  }, [roomId])

  useEffect(() => {
    if (!roomId) return
    let stopped = false
    let timer: number | undefined

    async function poll() {
      const mine = epoch.current
      try {
        const next = await fetchState(roomId!, version.current)
        if (stopped) return
        setOnline(true)
        // An action landed while this poll was in flight; its answer is newer.
        if (next && mine === epoch.current) applyState(next)
      } catch {
        if (!stopped) setOnline(false)
      }
      if (!stopped) timer = window.setTimeout(poll, POLL_INTERVAL)
    }

    poll()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [roomId, applyState])

  const send = useCallback(
    async (action: Action) => {
      if (!roomId) return
      epoch.current++
      try {
        const next = await sendAction(roomId, action)
        setOnline(true)
        applyState(next)
      } catch {
        setOnline(false)
      } finally {
        epoch.current++
      }
    },
    [roomId, applyState],
  )

  return (
    <>
      <header className="topbar">
        <Logo />
        <ThemeToggle theme={theme} onChange={setTheme} />
      </header>
      <main className="app">
        {state.started ? (
          <Draw
            questions={state.questions}
            drawnIds={state.drawnIds}
            onDraw={() => send({ type: 'draw', expect: state.drawnIds.length })}
            onReset={() => send({ type: 'reset' })}
          />
        ) : (
          <Collect
            questions={state.questions}
            onAdd={(text) => send({ type: 'add', text })}
            onRemove={(id) => send({ type: 'remove', id })}
            onDone={() => send({ type: 'start' })}
          />
        )}
        <RoomBar roomId={roomId} online={online} />
      </main>
    </>
  )
}
