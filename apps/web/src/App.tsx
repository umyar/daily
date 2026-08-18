import { useCallback, useEffect, useRef, useState } from 'react'
import { Collect } from './Collect'
import { Draw } from './Draw'
import { Ended } from './Ended'
import { Landing } from './Landing'
import { Logo } from './Logo'
import { RoomBar } from './RoomBar'
import { ThemeToggle } from './ThemeToggle'
import { playClick } from './sounds'
import { applyTheme, loadTheme, type Theme } from './theme'
import {
  authenticate,
  closeSession,
  fetchState,
  forgetToken,
  NeedsPassword,
  openSession,
  POLL_INTERVAL,
  rememberToken,
  roomIdFromPath,
  savedToken,
  sendAction,
  tokenIsFresh,
  unknownState,
  WrongPassword,
  type Action,
  type HostToken,
  type RoomState,
} from './room'
import './App.css'

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(roomIdFromPath)
  const [state, setState] = useState<RoomState>(unknownState)
  const [online, setOnline] = useState(true)
  const [theme, setTheme] = useState<Theme>(loadTheme)

  const [host, setHost] = useState<HostToken | null>(savedToken)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const [endError, setEndError] = useState('')

  const version = useRef(unknownState.version)
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

  async function start(password: string) {
    setStarting(true)
    setStartError('')
    try {
      const issued = await authenticate(password)
      const id = await openSession(issued.token)
      rememberToken(issued)
      setHost(issued)
      window.history.pushState(null, '', `/r/${id}`)
      version.current = unknownState.version
      setState(unknownState)
      setRoomId(id)
    } catch (error) {
      setStartError(
        error instanceof WrongPassword
          ? 'That password is not right.'
          : 'Could not reach the server.',
      )
    } finally {
      setStarting(false)
    }
  }

  // `password` arrives only when the stored token had already expired and the
  // host re-entered it, so ending never depends on a long-lived credential.
  async function end(password?: string) {
    if (!roomId) return
    setEndError('')
    epoch.current++
    try {
      let active = host
      if (password) {
        active = await authenticate(password)
        rememberToken(active)
        setHost(active)
      }
      if (!active) return
      applyState(await closeSession(roomId, active.token))
    } catch (error) {
      if (error instanceof WrongPassword) setEndError('That password is not right.')
      else if (error instanceof NeedsPassword) {
        // Token died between the freshness check and the request.
        forgetToken()
        setHost((current) => (current ? { ...current, expiresAt: 0 } : current))
      } else setOnline(false)
    } finally {
      epoch.current++
    }
  }

  // The server is the real gate; this only decides which controls to show. A
  // stale token still marks the device as the host's, so they get a re-auth
  // prompt rather than silently losing the ability to end their own session.
  const isHost = Boolean(host)
  const needsPassword = !tokenIsFresh(host)
  const live = state.status === 'open'
  const known = state.version >= 0

  return (
    <>
      <header className="topbar">
        <Logo />
        <ThemeToggle theme={theme} onChange={setTheme} />
      </header>
      <main className="app">
        {!roomId ? (
          <Landing busy={starting} error={startError} onStart={start} />
        ) : !known ? (
          <div className="panel">
            <p className="hint">Loading session…</p>
          </div>
        ) : !live ? (
          <Ended status={state.status} />
        ) : (
          <>
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
            <RoomBar
              roomId={roomId}
              online={online}
              isHost={isHost}
              needsPassword={needsPassword}
              error={endError}
              onEnd={end}
            />
          </>
        )}
      </main>
    </>
  )
}
