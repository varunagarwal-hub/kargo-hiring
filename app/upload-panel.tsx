'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Icon } from './ui'

type Item = { name: string; state: 'queued' | 'working' | 'done' | 'error'; message?: string; id?: string }

const ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export function UploadPanel() {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [role, setRole] = useState<'pm' | 'spm'>('pm')
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)

  async function upload(files: FileList | File[] | null) {
    const list = Array.from(files ?? []).filter((f) => /\.(pdf|docx)$/i.test(f.name))
    if (!list.length || busy) return
    setItems(list.map((f) => ({ name: f.name, state: 'queued' })))
    setBusy(true)
    // One request per CV, in sequence: each one scores, briefs and drafts before the next starts.
    for (let i = 0; i < list.length; i++) {
      setItems((cur) => cur.map((it, j) => (j === i ? { ...it, state: 'working' } : it)))
      const body = new FormData()
      body.set('file', list[i])
      body.set('role', role)
      let next: Item
      try {
        const res = await fetch('/api/candidates', { method: 'POST', body })
        const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string }
        next = res.ok
          ? { name: list[i].name, state: 'done', id: json.id }
          : { name: list[i].name, state: 'error', message: json.error ?? `HTTP ${res.status}`, id: json.id }
      } catch (e) {
        next = { name: list[i].name, state: 'error', message: (e as Error).message }
      }
      setItems((cur) => cur.map((it, j) => (j === i ? next : it)))
      router.refresh()
    }
    setBusy(false)
  }

  const pick = () => !busy && input.current?.click()

  return (
    <section aria-label="Add CVs">
      <div
        className={`intake ${drag ? 'drag' : ''} ${busy ? 'busy' : ''}`}
        onClick={pick}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          upload(e.dataTransfer.files)
        }}
      >
        <div className="intake-text">
          <strong>{busy ? 'Reading CVs…' : 'Add CVs'}</strong>
          <span>Drop PDF or DOCX files here. Each takes a minute or two to score, brief and draft.</span>
        </div>
        <div className="intake-side" onClick={(e) => e.stopPropagation()}>
          <div className="tabs" role="radiogroup" aria-label="Role applied for">
            {(['pm', 'spm'] as const).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={role === r} className={role === r ? 'on' : ''} disabled={busy} onClick={() => setRole(r)}>
                {r === 'pm' ? 'Product Manager' : 'Senior PM'}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" onClick={pick} disabled={busy}>
            {busy ? <span className="spinner" style={{ borderTopColor: 'var(--paper)' }} /> : <Icon name="upload" />}
            {busy ? 'Working' : 'Choose files'}
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            upload(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="queue" aria-live="polite">
          {items.map((it, i) => (
            <li key={i}>
              <span className="name">{it.name}</span>
              {it.state === 'queued' && <span className="faint">waiting</span>}
              {it.state === 'working' && (
                <span className="faint" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span className="spinner" />scoring, briefing, drafting
                </span>
              )}
              {it.state === 'done' && <a href={`/candidates/${it.id}`}>Open file</a>}
              {it.state === 'error' && (
                <span style={{ color: 'var(--bad)' }}>
                  {it.message} {it.id && <a href={`/candidates/${it.id}`}>Open</a>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
