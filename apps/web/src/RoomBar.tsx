import { useEffect, useRef, useState, type FormEvent } from 'react'

const COPIED_FOR = 1600
const CONFIRM_TIMEOUT = 4000

type Props = {
  roomId: string | null
  online: boolean
  isHost: boolean
  needsPassword: boolean
  error: string
  onEnd: (password?: string) => void
}

export function RoomBar({ roomId, online, isHost, needsPassword, error, onEnd }: Props) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy() {
    if (!roomId) return
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), COPIED_FOR)
    } catch {
      // Clipboard needs a secure context; the code is on screen to read out.
    }
  }

  return (
    <div className="roombar">
      <div className="roombar-row">
        <button type="button" className="ghost code" onClick={copy} disabled={!roomId}>
          <span className="dot" data-online={online} aria-hidden="true" />
          {roomId ?? '······'}
        </button>
        <span className="hint">
          {copied ? 'Link copied' : online ? 'Share this link' : 'Offline'}
        </span>
        {isHost ? <EndControl needsPassword={needsPassword} onEnd={onEnd} /> : null}
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function EndControl({
  needsPassword,
  onEnd,
}: {
  needsPassword: boolean
  onEnd: (password?: string) => void
}) {
  const [armed, setArmed] = useState(false)
  const [password, setPassword] = useState('')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function disarmLater() {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setArmed(false), CONFIRM_TIMEOUT)
  }

  function click() {
    if (!armed) {
      setArmed(true)
      disarmLater()
      return
    }
    window.clearTimeout(timer.current)
    setArmed(false)
    onEnd()
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!password.trim()) return
    onEnd(password.trim())
    setPassword('')
    setArmed(false)
  }

  // The token expired, so ending requires the password again — one step, since
  // typing it is already deliberate enough to serve as the confirmation.
  if (armed && needsPassword) {
    return (
      <form className="reauth" onSubmit={submit}>
        <input
          autoFocus
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password to end"
          aria-label="Host password"
          onBlur={disarmLater}
        />
        <button type="submit" className="ghost end" disabled={!password.trim()}>
          End
        </button>
      </form>
    )
  }

  return (
    <button type="button" className={`ghost end${armed ? ' armed' : ''}`} onClick={click}>
      {armed ? 'End for everyone?' : 'End session'}
    </button>
  )
}
