import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { RealtimeChannel } from '@supabase/supabase-js'

interface UseSalesRealtimeOptions {
  onSaleCreated?: () => void
  onSaleUpdated?: () => void
  onSaleDeleted?: () => void
  enabled?: boolean
}

/**
 * Hook to set up real-time subscriptions for sales table changes
 * Automatically refreshes data when sales are created, updated, or deleted
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

  // Update callbacks ref when they change (without re-subscribing)
  useEffect(() => {
    callbacksRef.current = { onSaleCreated, onSaleUpdated, onSaleDeleted }
  }, [onSaleCreated, onSaleUpdated, onSaleDeleted])

  useEffect(() => {
    mountedRef.current = true

    if (!enabled) {
      return
    }

    // Remove existing channel if any
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const channelName = `sales-realtime-${Date.now()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sales',
        },
        (payload) => {
          if (!mountedRef.current) return
          console.log('Real-time: Sale created', payload.new)
          callbacksRef.current.onSaleCreated?.()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sales',
        },
        (payload) => {
          if (!mountedRef.current) return
          console.log('Real-time: Sale updated', payload.new)
          callbacksRef.current.onSaleUpdated?.()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'sales',
        },
        (payload) => {
          if (!mountedRef.current) return
          console.log('Real-time: Sale deleted', payload.old)
          callbacksRef.current.onSaleDeleted?.()
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Real-time sales subscription active')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Real-time sales subscription error:', status)
          // Try to reconnect after a delay
          setTimeout(() => {
            if (mountedRef.current && enabled) {
              // Re-subscribe by recreating the effect
              const currentChannel = channelRef.current
              if (currentChannel) {
                supabase.removeChannel(currentChannel)
                channelRef.current = null
              }
            }
          }, 5000)
        }
      })

    channelRef.current = channel

    return () => {
      mountedRef.current = false
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [enabled])
}
