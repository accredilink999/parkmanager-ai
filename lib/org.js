// Get current user's org_id from session storage
export function getOrgId() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(sessionStorage.getItem('pm_user') || '{}').org_id || null;
  } catch { return null; }
}
