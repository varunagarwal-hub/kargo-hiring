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

  const done = items.filter((i) => i.state === 'done').length

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Add candidates</h2>
          <p>PDF or DOCX. Each CV takes about 1–3 minutes: personal details are separated, then it&apos;s scored, briefed and drafted.</p>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Role applied for">
          {(['pm', 'spm'] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={role === r}
              className={role === r ? 'on' : ''}
              disabled={busy}
              onClick={() => setRole(r)}
            >
              Applying for {r === 'pm' ? 'PM' : 'SPM'}
            </button>
          ))}
        </div>
      </div>
      <div className="card-body">
        <div
          className={`dropzone ${drag ? 'drag' : ''} ${busy ? 'busy' : ''}`}
          role="button"
          tabIndex={0}
          aria-disabled={busy}
          onClick={() => !busy && input.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && input.current?.click()}
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
          <span className="dropzone-icon"><Icon name="upload" size={20} /></span>
          <strong>
            {busy ? 'Processing CVs…' : <>Drop CVs here or <span className="link">browse</span></>}
          </strong>
          <span className="muted small">
            They&apos;ll be added as {role === 'pm' ? 'Product Manager' : 'Senior Product Manager'} applicants
          </span>
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
          <>
            <ul className="queue" aria-live="polite">
              {items.map((it, i) => (
                <li key={i}>
                  {it.state === 'working' && <span className="spinner" />}
                  {it.state === 'queued' && <Icon name="clock" className="muted" />}
                  {it.state === 'done' && <Icon name="checkCircle" className="ok-icon" />}
                  {it.state === 'error' && <Icon name="alert" className="err-icon" />}
                  <span className="name">{it.name}</span>
                  {it.state === 'queued' && <span className="muted small">Queued</span>}
                  {it.state === 'working' && <span className="muted small">Scoring, briefing, drafting…</span>}
                  {it.state === 'done' && <a href={`/candidates/${it.id}`} className="small">Open</a>}
                  {it.state === 'error' && (
                    <span className="small" style={{ color: 'var(--bad)' }}>
                      {it.message} {it.id && <a href={`/candidates/${it.id}`}>Open</a>}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {!busy && <p className="muted small" style={{ marginTop: 10 }}>{done} of {items.length} processed.</p>}
          </>
        )}
      </div>
    </section>
  )
}
