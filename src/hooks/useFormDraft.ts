import { useEffect, useRef } from 'react'

const STORAGE_PREFIX = 'ardhi:draft:'

/**
 * Persist a long-form draft to localStorage so a connection drop or
 * accidental page close doesn't lose what the user has typed.
 *
 * Usage:
 *   const draft = useFormDraft('multi-piece-sale', { open: dialogOpen, key: pieceIds.join(',') })
 *   const initial = draft.read() ?? defaultValues
 *   const [form, setForm] = useState(initial)
 *   useEffect(() => { draft.write(form) }, [form])
 *   // On successful save: draft.clear()
 *
 * The draft auto-clears when the dialog closes (so cancelling without saving
 * doesn't leave junk in localStorage). If you want the draft to survive a
 * cancel, pass `keepOnClose: true`.
 */
export function useFormDraft<T>(
  scope: string,
  options: {
    /** Whether the form is currently open. When it transitions to false, draft is cleared (unless keepOnClose). */
    open: boolean
    /** Stable identifier for the entity being edited (e.g. sale id) so different entities get different drafts. */
    key?: string | null
    /** If true, the draft survives close — only `clear()` removes it. Use only when the workflow expects the draft to persist. */
    keepOnClose?: boolean
  }
) {
  const { open, key, keepOnClose } = options
  const fullKey = `${STORAGE_PREFIX}${scope}${key ? `:${key}` : ''}`
  const wasOpenRef = useRef(false)

  useEffect(() => {
    // When the form transitions open → closed, drop the draft unless caller opted out.
    if (wasOpenRef.current && !open && !keepOnClose) {
      try { localStorage.removeItem(fullKey) } catch {}
    }
    wasOpenRef.current = open
  }, [open, keepOnClose, fullKey])

  function read(): T | null {
    try {
      const raw = localStorage.getItem(fullKey)
      if (!raw) return null
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  function write(value: T): void {
    try {
      localStorage.setItem(fullKey, JSON.stringify(value))
    } catch {
      // Quota exceeded or storage unavailable — non-critical.
    }
  }

  function clear(): void {
    try { localStorage.removeItem(fullKey) } catch {}
  }

  return { read, write, clear }
}
