/**
 * Input sanitization utilities
 * Prevents XSS attacks by sanitizing user input
 */

/**
 * Sanitize text input - removes potentially dangerous characters
 */
export function sanitizeText(input: string): string {
  if (!input) return ''
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers (onclick, onerror, etc.)
    .slice(0, 10000) // Max length limit
}

/**
 * Sanitize email - basic email sanitization
 */
export function sanitizeEmail(email: string): string {
  if (!email) return ''
  
  return email
    .trim()
    .toLowerCase()
    .replace(/[<>]/g, '')
    .slice(0, 254) // Max email length
}

/**
 * Sanitize phone number - keep digits, + sign, and common separators (/, -, space, parentheses)
 * Allows formatting like: 5822092120192614/10/593 or 03-123-456
 */
export function sanitizePhone(phone: string): string {
  if (!phone) return ''
  
  return phone
    .trim()
    .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers (onclick, onerror, etc.)
    .replace(/[^\d+\/\-\(\)\s]/g, '') // Keep digits, +, /, -, (, ), and spaces
    .slice(0, 50) // Max phone length (increased to accommodate separators)
}

/**
 * Validate Lebanese phone number format
 * Lebanese numbers: 03/70/71/76/78/79/81 followed by 6 digits
 * Or international format: +961 followed by the number
 * Strips separators before validation
 */
export function validateLebanesePhone(phone: string): boolean {
  if (!phone || !phone.trim()) return false
  
  const cleaned = sanitizePhone(phone)
  
  // Remove all non-digit characters except + for validation
  const digitsOnly = cleaned.replace(/[^\d+]/g, '')
  
  // Remove leading + if present for validation
  const withoutPlus = digitsOnly.replace(/^\+/, '')
  
  // Lebanese format: 03, 70, 71, 76, 78, 79, 81 followed by 6 digits (8 digits total)
  // Or with country code: 961 followed by the above (11 digits total)
  const lebanesePattern = /^(03|70|71|76|78|79|81)\d{6}$/
  const internationalPattern = /^961(03|70|71|76|78|79|81)\d{6}$/
  
  return lebanesePattern.test(withoutPlus) || internationalPattern.test(withoutPlus)
}

/**
 * Sanitize CIN - keep only alphanumeric
 */
export function sanitizeCIN(cin: string): string {
  if (!cin) return ''
  
  return cin
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '') // Keep only alphanumeric
    .slice(0, 50) // Max CIN length
}

/**
 * Sanitize notes/description - more permissive but still safe
 */
export function sanitizeNotes(notes: string): string {
  if (!notes) return ''
  
  return notes
    .trim()
    .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '') // Remove iframe tags
    .slice(0, 5000) // Max notes length
}

