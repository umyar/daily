import type { SessionStatus } from './room'

type Props = { status: SessionStatus }

export function Ended({ status }: Props) {
  const closed = status === 'closed'

  return (
    <div className="panel">
      <h1>{closed ? 'Session ended' : 'No such session'}</h1>
      <p className="hint">
        {closed
          ? 'The host closed this one. A new session means a new link.'
          : 'This link is not a live session — it may have expired, or the code is wrong.'}
      </p>
      <a className="primary as-button" href="/">
        Start a session
      </a>
    </div>
  )
}
