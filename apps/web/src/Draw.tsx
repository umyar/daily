import { useEffect, useMemo, useRef, useState } from 'react'
import type { Question } from './session'
import { playLand, playTick } from './sounds'

const FIRST_TICK = 55
const SLOWDOWN = 1.16
const LAST_TICK = 340
const CONFIRM_TIMEOUT = 4000

type Props = {
  questions: Question[]
  drawnIds: string[]
  onDraw: (id: string) => void
  onReset: () => void
}

export function Draw({ questions, drawnIds, onDraw, onReset }: Props) {
  const remaining = useMemo(
    () => questions.filter((question) => !drawnIds.includes(question.id)),
    [questions, drawnIds],
  )
  const current = questions.find((question) => question.id === drawnIds.at(-1))

  const [spinning, setSpinning] = useState(false)
  const [flash, setFlash] = useState<Question | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function spin() {
    if (spinning || !remaining.length) return
    const pool = remaining
    const winner = pool[Math.floor(Math.random() * pool.length)]
    let cursor = Math.floor(Math.random() * pool.length)
    let delay = FIRST_TICK
    let ticks = 0

    setSpinning(true)

    const tick = () => {
      if (delay >= LAST_TICK) {
        setSpinning(false)
        setFlash(null)
        onDraw(winner.id)
        playLand()
        return
      }
      cursor = (cursor + 1) % pool.length
      setFlash(pool[cursor])
      // The first tick shares its instant with the button's own click sound.
      if (ticks++) playTick((delay - FIRST_TICK) / (LAST_TICK - FIRST_TICK))
      delay *= SLOWDOWN
      timer.current = window.setTimeout(tick, delay)
    }

    tick()
  }

  const shown = spinning ? flash : current
  const done = !remaining.length

  return (
    <div className="panel">
      <div className="meta">
        <span>
          {remaining.length} of {questions.length} left
        </span>
        <ResetButton className="ghost" onReset={onReset} />
      </div>

      <div className={`stage${spinning ? ' spinning' : ''}`}>
        {shown ? (
          <p key={shown.id} className="question">
            {shown.text}
          </p>
        ) : (
          <p className="question placeholder">Ready when you are.</p>
        )}
      </div>

      {done ? (
        <div className="finish">
          <p className="hint">All questions used.</p>
          <ResetButton className="primary" onReset={onReset} />
        </div>
      ) : (
        <button type="button" className="primary" disabled={spinning} onClick={spin}>
          Randomize!
        </button>
      )}
    </div>
  )
}

function ResetButton({ className, onReset }: { className: string; onReset: () => void }) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function click() {
    if (armed) {
      window.clearTimeout(timer.current)
      onReset()
      return
    }
    setArmed(true)
    timer.current = window.setTimeout(() => setArmed(false), CONFIRM_TIMEOUT)
  }

  return (
    <button type="button" className={`${className}${armed ? ' armed' : ''}`} onClick={click}>
      {armed ? 'Clear everything?' : 'New session'}
    </button>
  )
}
