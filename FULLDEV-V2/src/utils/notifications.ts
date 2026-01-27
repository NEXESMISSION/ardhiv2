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
 * Check if a notification already exists for the same entity within a time window
 * Prevents duplicate notifications for the same event
 * Checks both by type and by entity_id (for sales, any notification about the same sale is considered duplicate)
 */
async function checkExistingNotification(
  type: string,
  entityType?: string,
  entityId?: string,
  timeWindowMinutes: number = 30
): Promise<boolean> {
  if (!entityType || !entityId) {
    return false // Can't check without entity info
  }

  try {
    const timeWindow = new Date()
    timeWindow.setMinutes(timeWindow.getMinutes() - timeWindowMinutes)

    // First check: exact match (same type, entity_type, entity_id)
    const { data: exactMatch, error: exactError } = await supabase
      .from('notifications')
      .select('id')
      .eq('type', type)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .gte('created_at', timeWindow.toISOString())
      .limit(1)

    if (exactError) {
      console.warn('[checkExistingNotification] Error checking for exact duplicates:', exactError)
    } else if (exactMatch && exactMatch.length > 0) {
      console.log('[checkExistingNotification] Found exact duplicate notification')
      return true
    }

    // Second check: for sales, check if ANY notification exists for this sale_id within time window
    // This prevents different notification types for the same sale (e.g., installment vs promise)
    if (entityType === 'sale') {
      const { data: saleMatch, error: saleError } = await supabase
        .from('notifications')
        .select('id, type, title')
        .eq('entity_type', 'sale')
        .eq('entity_id', entityId)
        .gte('created_at', timeWindow.toISOString())
        .limit(5) // Get a few to see what types exist

      if (saleError) {
        console.warn('[checkExistingNotification] Error checking for sale duplicates:', saleError)
      } else if (saleMatch && saleMatch.length > 0) {
        console.log(`[checkExistingNotification] Found ${saleMatch.length} existing notification(s) for sale ${entityId}:`, 
          saleMatch.map(n => ({ type: n.type, title: n.title })))
        return true // Found existing notification for this sale
      }
    }

    return false // No duplicates found
  } catch (error) {
    console.warn('[checkExistingNotification] Exception checking for duplicates:', error)
    return false // If check fails, allow notification
  }
}

/**
 * Delete old duplicate notifications for the same entity
 * Keeps only the most recent one
 */
async function cleanupDuplicateNotifications(
  entityType: string,
  entityId: string,
  timeWindowMinutes: number = 30
): Promise<void> {
  try {
    const timeWindow = new Date()
    timeWindow.setMinutes(timeWindow.getMinutes() - timeWindowMinutes)

    // Get all notifications for this entity within time window
    const { data: duplicates, error: fetchError } = await supabase
      .from('notifications')
      .select('id, created_at')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .gte('created_at', timeWindow.toISOString())
      .order('created_at', { ascending: false })

    if (fetchError || !duplicates || duplicates.length <= 1) {
      return // No duplicates or error fetching
    }

    // Keep the most recent one, delete the rest
    const idsToDelete = duplicates.slice(1).map(n => n.id)
    if (idsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('notifications')
        .delete()
        .in('id', idsToDelete)

      if (deleteError) {
        console.warn('[cleanupDuplicateNotifications] Error deleting duplicates:', deleteError)
      } else {
        console.log(`[cleanupDuplicateNotifications] Deleted ${idsToDelete.length} duplicate notification(s)`)
      }
    }
  } catch (error) {
    console.warn('[cleanupDuplicateNotifications] Exception cleaning duplicates:', error)
  }
}

/**
 * Create a notification for all owners
 * Robust implementation with proper error handling and validation
 * Includes duplicate prevention
 */
export async function notifyOwners(
  type: string,
  title: string,
  message: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, any>
): Promise<boolean> {
  // Validate inputs
  if (!type || !title || !message) {
    console.error('notifyOwners: Missing required parameters', { type, title, message })
    return false
  }

  // Check for existing notification to prevent duplicates
  const hasDuplicate = await checkExistingNotification(type, entityType, entityId, 30)
  if (hasDuplicate) {
    console.log('[notifyOwners] Duplicate notification prevented:', { type, entityType, entityId })
    // Clean up any old duplicates that might exist
    if (entityType && entityId) {
      await cleanupDuplicateNotifications(entityType, entityId, 30)
    }
    return true // Return true to indicate "success" (we prevented a duplicate, which is good)
  }

  try {
    // Try RPC function first (most efficient)
    console.log('[notifyOwners] Attempting RPC call:', { type, title, message: message.substring(0, 50) })
    const { data: rpcResult, error: rpcError } = await supabase.rpc('notify_owners', {
      p_type: type,
      p_title: title,
      p_message: message,
      p_entity_type: entityType || null,
      p_entity_id: entityId || null,
      p_metadata: metadata || null,
    })

    if (!rpcError) {
      console.log('[notifyOwners] RPC call succeeded:', rpcResult)
      return rpcResult === true
    }

    // RPC failed, use fallback
    console.warn('[notifyOwners] RPC failed, using fallback:', rpcError)
    return await notifyOwnersFallback(type, title, message, entityType, entityId, metadata)
  } catch (error) {
    console.error('[notifyOwners] Exception occurred:', error)
    // Try fallback on exception
    return await notifyOwnersFallback(type, title, message, entityType, entityId, metadata)
  }
}

/**
 * Fallback method to manually create notifications for owners
 * More robust with retry logic and better error handling
 */
async function notifyOwnersFallback(
  type: string,
  title: string,
  message: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, any>
): Promise<boolean> {
  const maxRetries = 3
  let lastError: any = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
    // Get all owner user IDs
    const { data: owners, error: ownersError } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'owner')

    if (ownersError) {
        lastError = ownersError
        console.error(`Attempt ${attempt}: Error fetching owners:`, ownersError)
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
          continue
        }
        return false
    }

    if (!owners || owners.length === 0) {
        console.warn('[notifyOwnersFallback] No owners found for notifications')
        return true // Not an error, just no owners to notify
    }

      console.log(`[notifyOwnersFallback] Found ${owners.length} owner(s) to notify`)

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

      // Insert notifications in batches to avoid payload size issues
      const batchSize = 50
      let successCount = 0

      for (let i = 0; i < notifications.length; i += batchSize) {
        const batch = notifications.slice(i, i + batchSize)
        const { error: insertError } = await supabase
      .from('notifications')
          .insert(batch)
      .select()

    if (insertError) {
          lastError = insertError
          console.error(`Attempt ${attempt}, Batch ${Math.floor(i / batchSize) + 1}: Error inserting notifications:`, insertError)
          if (attempt < maxRetries) break // Retry outer loop
    } else {
          successCount += batch.length
        }
      }

      if (successCount === notifications.length) {
        console.log(`[notifyOwnersFallback] Successfully created ${successCount} notification(s)`)
        return true
      }
      
      console.error(`[notifyOwnersFallback] Only created ${successCount}/${notifications.length} notifications`)

      // Partial success, retry failed ones
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        continue
    }
  } catch (error) {
      lastError = error
      console.error(`Attempt ${attempt}: Exception in notifyOwnersFallback:`, error)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }
    }
  }

  console.error('notifyOwnersFallback: All retries failed', lastError)
  return false
}

/**
 * Create a notification for the current user
 * Robust with validation and retry logic
 * Includes duplicate prevention
 */
export async function notifyCurrentUser(
  type: string,
  title: string,
  message: string,
  userId: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, any>
): Promise<boolean> {
  // Validate inputs
  if (!type || !title || !message || !userId) {
    console.error('notifyCurrentUser: Missing required parameters', { type, title, message, userId })
    return false
  }

  // Check for existing notification to prevent duplicates
  if (entityType && entityId) {
    const hasDuplicate = await checkExistingNotification(type, entityType, entityId, 30)
    if (hasDuplicate) {
      console.log('[notifyCurrentUser] Duplicate notification prevented:', { type, entityType, entityId, userId })
      // Clean up any old duplicates that might exist
      await cleanupDuplicateNotifications(entityType, entityId, 30)
      return true // Return true to indicate "success" (we prevented a duplicate)
    }
  }

  const maxRetries = 3
  let lastError: any = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { error: insertError } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        message,
        entity_type: entityType || null,
        entity_id: entityId || null,
        metadata: metadata || null,
        read: false,
      })
      .select()

      if (!insertError) {
        return true
      }

      lastError = insertError
      console.error(`Attempt ${attempt}: Error inserting notification:`, insertError)
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
    }
  } catch (error) {
      lastError = error
      console.error(`Attempt ${attempt}: Exception in notifyCurrentUser:`, error)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }
    }
  }

  console.error('notifyCurrentUser: All retries failed', lastError)
  return false
}

/**
 * Get notifications for the current user with pagination support
 * Optimized with proper error handling
 */
export async function getNotifications(
  userId: string, 
  limit: number = 20, 
  offset: number = 0
): Promise<Notification[]> {
  if (!userId) {
    console.error('getNotifications: Missing userId')
    return []
  }

  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1) // Use range for pagination
      .limit(Math.min(limit, 100)) // Cap at 100 for performance

    if (error) {
      console.error('Error fetching notifications:', error)
      return []
    }

    return (data || []) as Notification[]
  } catch (error) {
    console.error('Exception in getNotifications:', error)
    return []
  }
}

/**
 * Get unread notification count
 * Optimized query with proper error handling
 */
export async function getUnreadCount(userId: string): Promise<number> {
  if (!userId) {
    return 0
  }

  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)

    if (error) {
      console.error('Error fetching unread count:', error)
      return 0
    }

    return count || 0
  } catch (error) {
    console.error('Exception in getUnreadCount:', error)
    return 0
  }
}

/**
 * Mark notification as read
 * With validation and error handling
 */
export async function markAsRead(notificationId: string, userId: string): Promise<boolean> {
  if (!notificationId || !userId) {
    console.error('markAsRead: Missing required parameters')
    return false
  }

  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .eq('user_id', userId)

    if (error) {
      console.error('Error marking notification as read:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Exception in markAsRead:', error)
    return false
  }
}

/**
 * Mark all notifications as read
 * Optimized with proper error handling
 */
export async function markAllAsRead(userId: string): Promise<boolean> {
  if (!userId) {
    console.error('markAllAsRead: Missing userId')
    return false
  }

  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)

    if (error) {
      console.error('Error marking all notifications as read:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Exception in markAllAsRead:', error)
    return false
  }
}

/**
 * Delete notification
 * With validation and error handling
 */
export async function deleteNotification(notificationId: string, userId: string): Promise<boolean> {
  if (!notificationId || !userId) {
    console.error('deleteNotification: Missing required parameters')
    return false
  }

  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', userId)

    if (error) {
      console.error('Error deleting notification:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Exception in deleteNotification:', error)
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
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

