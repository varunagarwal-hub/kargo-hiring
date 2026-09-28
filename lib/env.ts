import 'server-only'

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing environment variable ${name} (see .env.example)`)
  return v
}

export const env = {
  geminiApiKey: () => required('GEMINI_API_KEY'),
  geminiModel: () => process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview',
  databaseUrl: () => required('DATABASE_URL'),
  resendApiKey: () => required('RESEND_API_KEY'),
  resendFromEmail: () => required('RESEND_FROM_EMAIL'),
  appPassword: () => required('APP_PASSWORD'),
  sessionSecret: () => required('SESSION_SECRET'),
}
