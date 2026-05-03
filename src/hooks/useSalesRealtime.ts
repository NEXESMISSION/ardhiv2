import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RealtimeChannel } from '@supabase/supabase-js'

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

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const channelName = `sales-realtime-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales' }, () => {
        if (mountedRef.current) callbacksRef.current.onSaleCreated?.()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sales' }, () => {
        if (mountedRef.current) callbacksRef.current.onSaleUpdated?.()
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'sales' }, () => {
        if (mountedRef.current) callbacksRef.current.onSaleDeleted?.()
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          failureCountRef.current = 0
          return
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 60s (cap)
          const attempt = Math.min(failureCountRef.current, 6)
          const delayMs = Math.min(1000 * Math.pow(2, attempt), 60000)
          failureCountRef.current += 1
          retryTimer = window.setTimeout(() => {
            if (mountedRef.current && enabled) {
              setResubscribeTick((n) => n + 1)
            }
          }, delayMs)
        }
      })

    channelRef.current = channel

    return () => {
      mountedRef.current = false
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [enabled, resubscribeTick])
}
