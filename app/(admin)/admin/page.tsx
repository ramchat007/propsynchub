import { redirect } from 'next/navigation';
import { getAuthenticatedAdminContext } from '@/lib/auth/admin-guard';
import { PLATFORM_SUPERADMIN_EMAILS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * /admin Redirection Guard
 * Enforces prompt requirement: Do not create a conflicting second platform-admin portal at /admin.
 * Routes superadmins to exclusive /admin-master and staff to /dashboard.
 */
export default async function AdminRedirectPage() {
  const auth = await getAuthenticatedAdminContext();

  if (!auth.user) {
    redirect('/login');
  }

  const userEmail = (auth.user.email || '').toLowerCase().trim();
  if (auth.role === 'superadmin' && PLATFORM_SUPERADMIN_EMAILS.includes(userEmail)) {
    redirect('/admin-master');
  }

  redirect('/dashboard');
}
