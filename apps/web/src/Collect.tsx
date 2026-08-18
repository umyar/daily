import { useState, type FormEvent } from 'react'
import type { Question } from './room'

type Props = {
  questions: Question[]
  onAdd: (text: string) => void
  onRemove: (id: string) => void
  onDone: () => void
}

export function Collect({ questions, onAdd, onRemove, onDone }: Props) {
  const [text, setText] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setText('')
  }

  return (
    <div className="panel">
      <h1>Daily questions</h1>
      <p className="hint">Add the questions for today, then hit Done.</p>

      <form className="row" onSubmit={submit}>
        <input
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="What did you ship yesterday?"
        />
        <button type="submit" disabled={!text.trim()}>
          Add
        </button>
      </form>

      <ol className="list">
        {questions.map((question, index) => (
          <li key={question.id}>
            <span className="index">{index + 1}</span>
            <span className="text">{question.text}</span>
            <button
              type="button"
              className="ghost"
              aria-label={`Remove question ${index + 1}`}
              onClick={() => onRemove(question.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>

      <button type="button" className="primary" disabled={!questions.length} onClick={onDone}>
        Done{questions.length ? ` · ${questions.length}` : ''}
      </button>
    </div>
  )
}
