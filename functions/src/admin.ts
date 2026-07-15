export const ALLOWED_ADMIN_EMAILS = new Set([
  'jgabbayj@gmail.com',
  'robieis153@gmail.com',
])

interface CallableAuth {
  token: Record<string, unknown>
}

export function getVerifiedAdminEmail(auth: CallableAuth | undefined) {
  const email = typeof auth?.token.email === 'string' ? auth.token.email.trim().toLowerCase() : ''
  const verified = auth?.token.email_verified === true
  return verified && ALLOWED_ADMIN_EMAILS.has(email) ? email : null
}
