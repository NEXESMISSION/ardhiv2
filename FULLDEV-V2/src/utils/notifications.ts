import { supabase } from '@/lib/supabase'

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  entity_type: string | null
  entity_id: string | null
  read: boolean
  created_at: string
  metadata: Record<string, any> | null
}

/**
 * Create a notification for all owners
 */
export async function notifyOwners(
  type: string,
  title: string,
  message: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    // Call the database function to notify all owners
    const { error } = await supabase.rpc('notify_owners', {
      p_type: type,
      p_title: title,
      p_message: message,
      p_entity_type: entityType || null,
      p_entity_id: entityId || null,
      p_metadata: metadata || null,
    })

    if (error) {
      console.error('Error creating notification:', error)
      // Fallback: manually create notifications for owners
      await notifyOwnersFallback(type, title, message, entityType, entityId, metadata)
    }
  } catch (error) {
    console.error('Error in notifyOwners:', error)
    // Fallback: manually create notifications for owners
    await notifyOwnersFallback(type, title, message, entityType, entityId, metadata)
  }
}

/**
 * Fallback method to manually create notifications for owners
 */
async function notifyOwnersFallback(
  type: string,
  title: string,
  message: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    // Get all owner user IDs
    const { data: owners, error: ownersError } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'owner')

    if (ownersError || !owners || owners.length === 0) {
      console.warn('No owners found for notifications')
      return
    }

    // Create notifications for each owner
    const notifications = owners.map(owner => ({
      user_id: owner.id,
      type,
      title,
      message,
      entity_type: entityType || null,
      entity_id: entityId || null,
      metadata: metadata || null,
      read: false,
    }))

    const { error: insertError } = await supabase
      .from('notifications')
      .insert(notifications)

    if (insertError) {
      console.error('Error inserting notifications:', insertError)
    }
  } catch (error) {
    console.error('Error in notifyOwnersFallback:', error)
  }
}

/**
 * Get notifications for the current user
 */
export async function getNotifications(limit: number = 50): Promise<Notification[]> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return []
  }
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(): Promise<number> {
  try {
    const { data, error, count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('read', false)

    if (error) throw error
    return count || 0
  } catch (error) {
    console.error('Error fetching unread count:', error)
    return 0
  }
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)

    if (error) throw error
    return true
  } catch (error) {
    console.error('Error marking notification as read:', error)
    return false
  }
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('read', false)

    if (error) throw error
    return true
  } catch (error) {
    console.error('Error marking all notifications as read:', error)
    return false
  }
}

/**
 * Delete notification
 */
export async function deleteNotification(notificationId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)

    if (error) throw error
    return true
  } catch (error) {
    console.error('Error deleting notification:', error)
    return false
  }
}

/**
 * Format time ago (e.g., "منذ 5 دقائق")
 */
export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'الآن'
  if (diffMins < 60) return `منذ ${diffMins} دقيقة${diffMins > 1 ? '' : ''}`
  if (diffHours < 24) return `منذ ${diffHours} ساعة${diffHours > 1 ? '' : ''}`
  if (diffDays < 7) return `منذ ${diffDays} يوم${diffDays > 1 ? '' : ''}`
  
  // Format date for older notifications
  return date.toLocaleDateString('ar-TN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

