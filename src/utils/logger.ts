// ============================================================================
// SHARED LOGGER
// Namespaced, color-coded console logger for dev. Stripped from prod by
// vite.config.ts esbuild `pure: ['console.log']`. Use console.warn/error
// (kept in prod) directly when you actually need a production-visible signal.
// ============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const NAMESPACE_COLORS: Record<string, string> = {
  Auth:        '#7c3aed',
  Layout:      '#0891b2',
  Sales:       '#16a34a',
  Confirm:     '#ca8a04',
  Land:        '#dc2626',
  Installments:'#9333ea',
  Finance:     '#0d9488',
  Clients:     '#2563eb',
  Users:       '#64748b',
  Notif:       '#db2777',
  Realtime:    '#f97316',
  Net:         '#475569',
}

function colorFor(ns: string) {
  return NAMESPACE_COLORS[ns] ?? '#334155'
}

function ts() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

function emit(level: LogLevel, ns: string, msg: string, data?: unknown) {
  const tag = `%c[${ts()}] ${ns}`
  const style = `color:${colorFor(ns)};font-weight:bold`
  const args: unknown[] = [tag, style, msg]
  if (data !== undefined) args.push(data)
  switch (level) {
    case 'debug': console.log(...args); break
    case 'info':  console.log(...args); break
    case 'warn':  console.warn(...args); break
    case 'error': console.error(...args); break
  }
}

export interface NamespaceLogger {
  debug: (msg: string, data?: unknown) => void
  info:  (msg: string, data?: unknown) => void
  warn:  (msg: string, data?: unknown) => void
  error: (msg: string, data?: unknown) => void
  /** Wrap an async operation with start/end timing logs and error capture. */
  track: <T>(label: string, fn: () => Promise<T>) => Promise<T>
}

export function logger(namespace: string): NamespaceLogger {
  return {
    debug: (msg, data) => emit('debug', namespace, msg, data),
    info:  (msg, data) => emit('info',  namespace, msg, data),
    warn:  (msg, data) => emit('warn',  namespace, msg, data),
    error: (msg, data) => emit('error', namespace, msg, data),
    async track(label, fn) {
      const start = performance.now()
      emit('debug', namespace, `▶ ${label}`)
      try {
        const result = await fn()
        const ms = Math.round(performance.now() - start)
        emit('debug', namespace, `✓ ${label} (${ms}ms)`)
        return result
      } catch (err) {
        const ms = Math.round(performance.now() - start)
        emit('error', namespace, `✗ ${label} (${ms}ms)`, err)
        throw err
      }
    },
  }
}
