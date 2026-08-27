// Founder allowlist for the internal /admin dashboard. Deliberately a
// hardcoded list, not an env var or a DB role/flag -- there's exactly
// one place this ever needs editing, and no way a shop owner/staff
// row (or a misconfigured env var) can accidentally qualify.
export const ADMIN_EMAILS = ['tbbryant07@gmail.com', 'cra854@gmail.com']

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email)
}
