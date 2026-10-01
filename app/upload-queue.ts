// Client-side upload queue. Lives at module level (not in a component) so it keeps
// running when the founder opens a candidate or Settings mid-batch. Each file keeps
// the role that was selected when it was added; two CVs are processed at a time.

export type Role = 'pm' | 'spm'
export type QueueItem = {
  key: number
  name: string
  role: Role
  state: 'queued' | 'working' | 'done' | 'error'
  message?: string
  id?: string
}

const CONCURRENCY = 2
let items: QueueItem[] = []
const files = new Map<number, File>()
let active = 0
let nextKey = 1
const listeners = new Set<() => void>()
const finishedListeners = new Set<() => void>()

function emit() {
  items = [...items]
  for (const l of listeners) l()
}
function update(key: number, patch: Partial<QueueItem>) {
  items = items.map((it) => (it.key === key ? { ...it, ...patch } : it))
  emit()
}

async function run(item: QueueItem) {
  update(item.key, { state: 'working' })
  const body = new FormData()
  body.set('file', files.get(item.key)!)
  body.set('role', item.role)
  try {
    const res = await fetch('/api/candidates', { method: 'POST', body })
    const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string }
    update(item.key, res.ok ? { state: 'done', id: json.id } : { state: 'error', message: json.error ?? `HTTP ${res.status}`, id: json.id })
  } catch (e) {
    update(item.key, { state: 'error', message: (e as Error).message })
  } finally {
    files.delete(item.key)
  }
}

function pump() {
  while (active < CONCURRENCY) {
    const next = items.find((it) => it.state === 'queued' && files.has(it.key))
    if (!next) return
    active++
    next.state = 'working' // claim synchronously so the loop doesn't pick it twice
    run(next).finally(() => {
      active--
      for (const l of finishedListeners) l()
      pump()
    })
  }
}

export const uploadQueue = {
  add(list: File[], role: Role) {
    const accepted = list.filter((f) => /\.(pdf|docx)$/i.test(f.name))
    for (const f of accepted) {
      const key = nextKey++
      files.set(key, f)
      items.push({ key, name: f.name, role, state: 'queued' })
    }
    emit()
    pump()
    return list.length - accepted.length // rejected count
  },
  clearFinished() {
    items = items.filter((it) => it.state === 'queued' || it.state === 'working')
    emit()
  },
  get: () => items,
  pending: () => items.some((it) => it.state === 'queued' || it.state === 'working'),
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  },
  /** Called each time a CV finishes (so the dashboard can refresh). */
  onFinished(fn: () => void) {
    finishedListeners.add(fn)
    return () => void finishedListeners.delete(fn)
  },
}
