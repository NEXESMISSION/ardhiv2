import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RealtimeChannel } from '@supabase/supabase-js'
import { logger } from '@/utils/logger'

const log = logger('Realtime')

interface UseSalesRealtimeOptions {
  onSaleCreated?: () => void
  onSaleUpdated?: () => void
  onSaleDeleted?: () => void
  enabled?: boolean
}

/**
 * Subscribe to real-time changes on the `sales` table.
 *
 * Reliability: on CHANNEL_ERROR / TIMED_OUT we tear down and resubscribe with
 * exponential backoff (capped at 60s). The previous version cleared the
 * channel ref but never created a new one, so the page would silently stop
 * receiving updates after the first transport hiccup.
 */
export function useSalesRealtime({
  onSaleCreated,
  onSaleUpdated,
  onSaleDeleted,
  enabled = true,
}: UseSalesRealtimeOptions = {}) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const mountedRef = useRef(true)
  const callbacksRef = useRef({ onSaleCreated, onSaleUpdated, onSaleDeleted })
  const [resubscribeTick, setResubscribeTick] = useState(0)
  const failureCountRef = useRef(0)

  // Keep latest callbacks accessible without re-subscribing.
  useEffect(() => {
    callbacksRef.current = { onSaleCreated, onSaleUpdated, onSaleDeleted }
  }, [onSaleCreated, onSaleUpdated, onSaleDeleted])

  useEffect(() => {
    mountedRef.current = true

    if (!enabled) {
      return () => {
        mountedRef.current = false
      }
    }

    let retryTimer: number | null = null
    // Per-effect-run flag: when our cleanup calls removeChannel, supabase
    // fires CLOSED back into our subscribe callback. Without this guard, that
    // CLOSED was being treated as a real disconnect → schedule retry → bump
    // resubscribeTick → re-run the effect → cleanup → another CLOSED →
    // INFINITE LOOP at ~1Hz (visible in the user's console as hundreds of
    // "reconnecting in 1000ms" lines per minute). This flag short-circuits
    // the handler for the current channel as soon as cleanup begins.
    let teardownInProgress = false

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const channelName = `sales-realtime-${Date.now()}-${Math.random().toString(36).slice(2)}`
    log.debug('subscribe: opening sales channel', { channelName })
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales' }, (payload) => {
        log.debug('sales INSERT received', { saleId: (payload.new as { id?: string })?.id })
        if (mountedRef.current) callbacksRef.current.onSaleCreated?.()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sales' }, (payload) => {
        log.debug('sales UPDATE received', {
          saleId: (payload.new as { id?: string })?.id,
          status: (payload.new as { status?: string })?.status,
        })
        if (mountedRef.current) callbacksRef.current.onSaleUpdated?.()
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'sales' }, (payload) => {
        log.debug('sales DELETE received', { saleId: (payload.old as { id?: string })?.id })
        if (mountedRef.current) callbacksRef.current.onSaleDeleted?.()
      })
      .subscribe((status) => {
        // Intentional teardown — ignore. CLOSED from supabase only fires when
        // we explicitly remove the channel, so it's never a real disconnect
        // we need to recover from.
        if (teardownInProgress) return

        if (status === 'SUBSCRIBED') {
          if (failureCountRef.current > 0) {
            log.info(`subscribe: reconnected after ${failureCountRef.current} failure(s)`, { channelName })
          } else {
            log.debug('subscribe: SUBSCRIBED', { channelName })
          }
          failureCountRef.current = 0
          return
        }
        // CLOSED is only fired by an explicit unsubscribe / removeChannel —
        // treat it as a no-op and do NOT retry. The previous version chained
        // CLOSED into the retry path, which created an infinite reconnect
        // loop in dev (StrictMode double-invoke) and on every page change.
        // We still retry on CHANNEL_ERROR and TIMED_OUT (real transport
        // failures) using exponential backoff.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          const attempt = Math.min(failureCountRef.current, 6)
          const delayMs = Math.min(1000 * Math.pow(2, attempt), 60000)
          failureCountRef.current += 1
          log.warn(`subscribe: ${status} — reconnecting in ${delayMs}ms (attempt ${failureCountRef.current})`, { channelName })
          retryTimer = window.setTimeout(() => {
            if (mountedRef.current && enabled && !teardownInProgress) {
              setResubscribeTick((n) => n + 1)
            }
          }, delayMs)
        }
      })

    channelRef.current = channel

    return () => {
      teardownInProgress = true
      mountedRef.current = false
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [enabled, resubscribeTick])
}
