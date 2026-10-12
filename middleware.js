import { next } from '@vercel/functions';
import { authorize, privateHeaders } from './server/auth.js';

export const config = { runtime: 'nodejs', matcher: '/:path*' };

export default async function middleware(request) {
  return await authorize(request) || next({ headers: privateHeaders });
}
