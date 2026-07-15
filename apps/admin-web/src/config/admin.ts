export const ALLOWED_ADMIN_EMAILS = new Set([
  'jgabbayj@gmail.com',
  'robieis153@gmail.com',
])

export function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase('en-US')
}

export function isAllowedAdmin(email: string | null | undefined): boolean {
  return Boolean(email && ALLOWED_ADMIN_EMAILS.has(normalizeEmail(email)))
}
