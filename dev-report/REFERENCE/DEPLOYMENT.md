# Deployment Guide

## 🎯 Overview

Complete guide for deploying the application to production.

## 📋 Pre-Deployment Checklist

- [ ] All features implemented
- [ ] All tests passing
- [ ] Code reviewed
- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] Security verified
- [ ] Performance optimized
- [ ] Error handling complete

## 🚀 Vercel Deployment

### 1. Install Vercel CLI

```bash
npm install -g vercel
```

### 2. Create vercel.json

```json
{
  "buildCommand": "cd frontend && npm run build",
  "outputDirectory": "frontend/dist",
  "devCommand": "cd frontend && npm run dev",
  "installCommand": "cd frontend && npm install",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### 3. Deploy

```bash
vercel
```

### 4. Set Environment Variables

In Vercel dashboard:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 🔒 Production Security

### 1. Environment Variables

Never commit `.env` files. Use Vercel environment variables.

### 2. Disable Dev Mode

```typescript
// Dev mode automatically disabled in production
const isDev = import.meta.env.DEV
```

### 3. Error Tracking

```typescript
// Add error tracking service
if (import.meta.env.PROD) {
  // Initialize Sentry, LogRocket, etc.
}
```

## 📊 Performance Optimization

### 1. Code Splitting

```typescript
// Lazy load routes
const Sales = lazy(() => import('./pages/Sales'))
```

### 2. Image Optimization

Use optimized images and lazy loading.

### 3. Bundle Analysis

```bash
npm run build -- --analyze
```

## ✅ Deployment Checklist

- [ ] Build succeeds
- [ ] Environment variables set
- [ ] Database accessible
- [ ] Authentication works
- [ ] All features working
- [ ] Performance acceptable
- [ ] Error tracking setup
- [ ] Monitoring setup

