/**
 * Module 4: User Activity
 * Audits user logins, inactive accounts, permission assignments,
 * super admin counts, and users who have never logged in.
 */
import { AxiosInstance } from 'axios';
import { UserActivityData, UserStat } from '../../types/audit';
import { logger } from '../../lib/logger';

const ACTIVE_DAYS = 30;
const INACTIVE_DAYS = 90;

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

export async function runUserActivity(client: AxiosInstance): Promise<UserActivityData> {
  logger.info('Running user activity module...');

  try {
    const { data } = await client.get('/settings/v3/users', { params: { limit: 500 } });
    const rawUsers = data.results ?? [];

    const users: UserStat[] = rawUsers.map((u: any): UserStat => {
      const lastLogin = u.lastLogin ?? null;
      const activeDaysAgo = daysSince(lastLogin);
      return {
        id: u.id,
        email: u.email,
        role: u.roleIds?.[0] ?? null,
        lastLogin,
        activeDaysAgo,
      };
    });

    const total = users.length;
    const active = users.filter(
      (u) => u.activeDaysAgo !== null && u.activeDaysAgo <= ACTIVE_DAYS
    ).length;
    const inactive = users.filter(
      (u) => u.activeDaysAgo !== null && u.activeDaysAgo > INACTIVE_DAYS
    ).length;
    const neverLoggedIn = users.filter((u) => u.lastLogin === null).length;

    // Count super admins via roles endpoint
    let superAdmins = 0;
    try {
      const { data: rolesData } = await client.get('/settings/v3/users/roles');
      const superAdminRoleId = (rolesData.results ?? []).find(
        (r: any) => r.name?.toLowerCase().includes('super')
      )?.id;

      if (superAdminRoleId) {
        superAdmins = rawUsers.filter((u: any) =>
          u.roleIds?.includes(superAdminRoleId)
        ).length;
      }
    } catch {
      // Roles endpoint may not be available on all tiers
    }

    const usersWithNoRole = users.filter((u) => !u.role).length;

    logger.info('User activity module complete', {
      total,
      active,
      inactive,
      neverLoggedIn,
      superAdmins,
    });

    return { total, active, inactive, neverLoggedIn, superAdmins, usersWithNoRole, users };
  } catch (err: any) {
    logger.warn('Could not fetch user data', { error: err.message });
    return {
      total: 0, active: 0, inactive: 0,
      neverLoggedIn: 0, superAdmins: 0, usersWithNoRole: 0, users: [],
    };
  }
}
