/**
 * Retry utility with exponential backoff for handling network failures
 * Especially useful for mobile devices with unstable connections
 */

export interface RetryOptions {
  maxRetries?: number
  initialDelay?: number
  maxDelay?: number
  backoffMultiplier?: number
  timeout?: number
  onRetry?: (attempt: number, error: Error) => void
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  timeout: 10000, // 10 seconds
  onRetry: () => {},
}

/**
 * Creates a timeout promise that rejects after specified milliseconds
 */
function createTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`))
    }, ms)
  })
}

/**
 * Retries a function with exponential backoff
 * @param fn - The async function to retry
 * @param options - Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retries fail
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      // Race between the function and timeout
      const result = await Promise.race([
        fn(),
        createTimeout(opts.timeout),
      ])
      return result
    } catch (error) {
      lastError = error as Error

      // Don't retry on the last attempt
      if (attempt === opts.maxRetries) {
        break
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt),
        opts.maxDelay
      )

      // Call retry callback
      opts.onRetry(attempt + 1, lastError)

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError || new Error('Unknown error occurred')
}

/**
 * Checks if an error is a network-related error that should be retried
 */
export function isRetryableError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase()
  const retryablePatterns = [
    'network',
    'timeout',
    'fetch',
    'connection',
    'failed to fetch',
    'networkerror',
    'network request failed',
  ]

  return retryablePatterns.some((pattern) => errorMessage.includes(pattern))
}

