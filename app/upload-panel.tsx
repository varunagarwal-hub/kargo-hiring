'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Icon } from './ui'
import { uploadQueue, type Role } from './upload-queue'

const ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const ROLE_NAME: Record<Role, string> = { pm: 'Product Manager', spm: 'Senior PM' }

export function UploadPanel() {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [role, setRole] = useState<Role>('pm')
  const [drag, setDrag] = useState(false)
  const [rejected, setRejected] = useState(0)
  const items = useSyncExternalStore(uploadQueue.subscribe, uploadQueue.get, uploadQueue.get)
  const pending = items.some((it) => it.state === 'queued' || it.state === 'working')
  const finished = items.filter((it) => it.state === 'done' || it.state === 'error').length

  // Refresh the ranking each time a CV finishes.
  useEffect(() => uploadQueue.onFinished(() => router.refresh()), [router])
  // Closing the tab would drop files that haven't been sent yet.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (uploadQueue.pending()) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const add = (files: FileList | null) => setRejected(uploadQueue.add(Array.from(files ?? []), role))
  const pick = () => input.current?.click()

  return (
    <section aria-label="Add CVs">
      <div
        className={`intake ${drag ? 'drag' : ''}`}
        onClick={pick}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          add(e.dataTransfer.files)
        }}
      >
        <div className="intake-text">
          <strong>Add CVs as {ROLE_NAME[role]} applicants</strong>
          <span>
            Drop PDF or DOCX files here. You can switch roles and keep adding while earlier CVs are still being read.
          </span>
        </div>
        <div className="intake-side" onClick={(e) => e.stopPropagation()}>
          <div className="tabs" role="radiogroup" aria-label="Role applied for">
            {(['pm', 'spm'] as const).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={role === r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>
                {ROLE_NAME[r]}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" onClick={pick}>
            <Icon name="upload" />
            Choose files
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            add(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {rejected > 0 && (
        <p className="note note-bad" style={{ marginTop: 10 }}>
          {rejected} file{rejected === 1 ? ' was' : 's were'} skipped: only PDF and DOCX are supported.
        </p>
      )}

      {items.length > 0 && (
        <>
          <ul className="queue" aria-live="polite">
            {items.map((it) => (
              <li key={it.key}>
                <span className="name">{it.name}</span>
                <span className="kicker" style={{ minWidth: 72 }}>{it.role === 'pm' ? 'PM' : 'Senior PM'}</span>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 13 }}>
            <span className="faint">
              {pending ? `${items.length - finished} in progress · ${finished} done` : `All ${finished} processed`}
            </span>
            {finished > 0 && (
              <button type="button" className="textbtn" onClick={() => uploadQueue.clearFinished()}>
                Clear finished
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
