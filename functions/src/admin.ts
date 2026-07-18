export const ALLOWED_ADMIN_EMAILS = new Set([
  'jgabbayj@gmail.com',
  'robieis153@gmail.com',
])

interface TokenAuth {
  token: Record<string, unknown>
}

export function getAllowedAdminEmail(auth: TokenAuth | undefined) {
  const email = typeof auth?.token.email === 'string' ? auth.token.email.trim().toLowerCase() : ''
  return ALLOWED_ADMIN_EMAILS.has(email) ? email : null
}
