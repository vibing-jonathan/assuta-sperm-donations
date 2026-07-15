const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(
  /\/$/,
  '',
)

export interface AdminPrincipal {
  user_id: string
  email: string
  role: 'admin'
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function verifyAdminAccess(
  accessToken: string,
  signal?: AbortSignal,
): Promise<AdminPrincipal> {
  const response = await fetch(`${apiBaseUrl}/api/auth/me`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal,
  })

  if (!response.ok) {
    let message = 'לא ניתן לאמת את הרשאת המנהל.'
    try {
      const payload = (await response.json()) as { detail?: string }
      if (payload.detail) message = payload.detail
    } catch {
      // Keep the generic message when the response is not JSON.
    }
    throw new ApiError(response.status, message)
  }

  return (await response.json()) as AdminPrincipal
}
