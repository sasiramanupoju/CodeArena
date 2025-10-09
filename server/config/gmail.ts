// Gmail API Configuration for Email Service

export interface GmailAPIConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  userEmail: string;
}

export const gmailConfig = {
  // Local Development (Gmail)
  local: {
    clientId: process.env.GMAIL_CLIENT_ID || '524898025855-g1n4oa8h1nu3mnc96c7aeotroilgi1bv.apps.googleusercontent.com',
    clientSecret: process.env.GMAIL_CLIENT_SECRET || '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',
    refreshToken: process.env.GMAIL_REFRESH_TOKEN || '1//040Hh7HnEhfKlCgYIARAAGAQSNwF-L9IrcLCow4qvS1PFfEYoyrLcBoFkhB_YjH39cPe2nMx-kWOKh_veNvpxUG08kU3IpYTdiM4',
    userEmail: process.env.GMAIL_USER_EMAIL || 'codearena@gmail.com'
  } as GmailAPIConfig,
  
  // Railway Production (Gmail API)
  railway: {
    clientId: process.env.GMAIL_CLIENT_ID || 'your-gmail-client-id',
    clientSecret: process.env.GMAIL_CLIENT_SECRET || 'your-gmail-client-secret',
    refreshToken: process.env.GMAIL_REFRESH_TOKEN || 'your-gmail-refresh-token',
    userEmail: process.env.GMAIL_USER_EMAIL || 'team.codeareena@gmail.com'
  } as GmailAPIConfig
};

// Environment detection
export const getCurrentGmailConfig = (): GmailAPIConfig => {
  if (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') {
    console.log('🚀 Railway/Production Environment Detected - Using Gmail API');
    return gmailConfig.railway;
  } else {
    console.log('🏠 Local Development Environment Detected - Using Gmail API');
    return gmailConfig.local;
  }
};

// Gmail API Scopes required for sending emails
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose'
];

// Gmail API discovery URL
export const GMAIL_DISCOVERY_URL = 'https://gmail.googleapis.com/$discovery/rest?version=v1'; 