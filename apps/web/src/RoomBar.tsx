import { useEffect, useRef, useState } from 'react'

const COPIED_FOR = 1600

type Props = { roomId: string | null; online: boolean }

export function RoomBar({ roomId, online }: Props) {
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
      <button type="button" className="ghost code" onClick={copy} disabled={!roomId}>
        <span className="dot" data-online={online} aria-hidden="true" />
        {roomId ?? '······'}
      </button>
      <span className="hint">{copied ? 'Link copied' : online ? 'Share this link' : 'Offline'}</span>
    </div>
  )
}
