# Testing Setup & Configuration

## 🎯 Overview

Complete testing setup with Vitest, React Testing Library, and testing patterns.

## 📋 Setup Testing

### Install Dependencies

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitest/ui
```

### Create Vitest Config

```typescript
// vitest.config.ts

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

### Create Test Setup File

```typescript
// src/test/setup.ts

import { expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

expect.extend(matchers)

afterEach(() => {
  cleanup()
})
```

### Update package.json

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

## 🧪 Testing Patterns

### Component Testing

```typescript
// components/ui/Button.test.tsx

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

describe('Button', () => {
  it('renders correctly', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })
  
  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn()
    const user = userEvent.setup()
    
    render(<Button onClick={handleClick}>Click me</Button>)
    
    await user.click(screen.getByText('Click me'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
```

### Hook Testing

```typescript
// hooks/useSale.test.ts

import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSale } from './useSale'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

describe('useSale', () => {
  it('fetches sale data', async () => {
    const { result } = renderHook(() => useSale('sale-id'), {
      wrapper: createWrapper(),
    })
    
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeDefined()
  })
})
```

### Service Testing

```typescript
// services/saleService.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SaleService } from './saleService'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

describe('SaleService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  
  it('creates sale successfully', async () => {
    const mockSale = { id: '1', client_id: 'client-1' }
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: mockSale, error: null }),
      }),
    })
    
    vi.mocked(supabase.from).mockReturnValue({
      insert: mockInsert,
    } as any)
    
    const result = await SaleService.createSale(mockSale as any)
    expect(result).toEqual(mockSale)
  })
})
```

### Utility Testing

```typescript
// lib/calculations/saleCalculations.test.ts

import { describe, it, expect } from 'vitest'
import { calculateCompanyFee, calculateAdvanceAmount } from './saleCalculations'

describe('calculateCompanyFee', () => {
  it('calculates company fee correctly', () => {
    expect(calculateCompanyFee(1000, 2)).toBe(20)
    expect(calculateCompanyFee(5000, 5)).toBe(250)
  })
  
  it('throws error for invalid inputs', () => {
    expect(() => calculateCompanyFee(-100, 2)).toThrow()
    expect(() => calculateCompanyFee(100, -5)).toThrow()
    expect(() => calculateCompanyFee(100, 150)).toThrow()
  })
})
```

## 🎯 Testing Best Practices

1. **Test behavior, not implementation**
2. **Use descriptive test names**
3. **Arrange-Act-Assert pattern**
4. **Mock external dependencies**
5. **Test edge cases**
6. **Keep tests simple**
7. **Test user interactions**

## ✅ Testing Checklist

- [ ] Vitest configured
- [ ] Test setup file created
- [ ] Component tests written
- [ ] Hook tests written
- [ ] Service tests written
- [ ] Utility tests written
- [ ] Coverage >80%
- [ ] All tests passing

