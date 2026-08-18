import { useState, type FormEvent } from 'react'

type Props = {
  busy: boolean
  error: string
  onStart: (password: string) => void
}

export function Landing({ busy, error, onStart }: Props) {
  const [password, setPassword] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!password.trim() || busy) return
    onStart(password.trim())
  }

  return (
    <div className="panel">
      <h1>Daily</h1>
      <p className="hint">
        Start a session, then share the link. Anyone with it can add questions and spin.
      </p>

      <form className="row" onSubmit={submit}>
        <input
          autoFocus
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Host password"
          aria-label="Host password"
          aria-invalid={Boolean(error)}
        />
        <button type="submit" className="primary" disabled={!password.trim() || busy}>
          {busy ? 'Starting…' : 'Start'}
        </button>
      </form>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
