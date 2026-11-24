import { next } from '@vercel/functions/middleware';
import { createAccessHandler } from './server/access.js';

// With no matcher, every page, static asset and download is checked before the CDN cache.
const access = createAccessHandler({
  next: () => next({ headers: {
    'Cache-Control': 'private, no-store',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  } }),
});

export default function proxy(request) {
  return access(request);
}
