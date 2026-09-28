'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Item = { name: string; state: 'queued' | 'working' | 'done' | 'error'; message?: string; id?: string }

export function UploadPanel() {
  const router = useRouter()
  const [role, setRole] = useState<'pm' | 'spm'>('pm')
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)

  async function upload(files: FileList | null) {
    if (!files?.length) return
    const list = Array.from(files)
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
        next = res.ok ? { name: list[i].name, state: 'done', id: json.id } : { name: list[i].name, state: 'error', message: json.error ?? `HTTP ${res.status}`, id: json.id }
      } catch (e) {
        next = { name: list[i].name, state: 'error', message: (e as Error).message }
      }
      setItems((cur) => cur.map((it, j) => (j === i ? next : it)))
      router.refresh()
    }
    setBusy(false)
  }

  return (
    <div className="card">
      <div className="row">
        <strong>Upload CVs</strong>
        <label style={{ margin: 0 }}>
          Role applied for{' '}
          <select value={role} onChange={(e) => setRole(e.target.value as 'pm' | 'spm')} disabled={busy}>
            <option value="pm">PM</option>
            <option value="spm">SPM</option>
          </select>
        </label>
        <input
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          disabled={busy}
          onChange={(e) => {
            upload(e.target.files)
            e.target.value = ''
          }}
        />
        <span className="muted small">PDF or DOCX. Each CV takes about 30–60 seconds (scores, brief, draft).</span>
      </div>
      {items.length > 0 && (
        <ul className="small" style={{ margin: '10px 0 0', paddingLeft: 18 }}>
          {items.map((it, i) => (
            <li key={i}>
              {it.name}:{' '}
              {it.state === 'queued' && <span className="muted">queued</span>}
              {it.state === 'working' && <span className="muted">extracting, scoring, drafting…</span>}
              {it.state === 'done' && <a href={`/candidates/${it.id}`}>done, open</a>}
              {it.state === 'error' && (
                <span style={{ color: 'var(--bad)' }}>
                  {it.message} {it.id && <a href={`/candidates/${it.id}`}>open</a>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
