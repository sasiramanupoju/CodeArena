// Environment variables with fallbacks
export const config = {
  apiUrl: import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3000` : 'https://dazzling-bravery-production.up.railway.app'),
  frontendUrl: import.meta.env.VITE_FRONTEND_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://codearenaaa.vercel.app'),
  env: import.meta.env.MODE || 'development'
} as const;

// API endpoints
export const endpoints = {
  register: `${config.apiUrl}/api/auth/register`,
  login: `${config.apiUrl}/api/auth/login`,
  logout: `${config.apiUrl}/api/auth/logout`,
  googleAuth: `${config.apiUrl}/api/auth/google`,
  user: `${config.apiUrl}/api/auth/user`,
  verifyEmail: `${config.apiUrl}/api/auth/verify-email`,
  resendVerification: `${config.apiUrl}/api/auth/resend-verification`,
  problems: `${config.apiUrl}/api/problems`,
  contests: `${config.apiUrl}/api/contests`,
  leaderboard: `${config.apiUrl}/api/leaderboard`,
  profile: `${config.apiUrl}/api/profile`,
  settings: `${config.apiUrl}/api/settings`,
} as const;