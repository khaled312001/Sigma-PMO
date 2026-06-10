import { User } from '../canonical/entities';
import { Role } from './roles.enum';

/**
 * Subcontractor activity-scope filter (Wave 7, correction-plan §2.9).
 *
 * For SUBCONTRACTOR users with a non-empty `activityScope`, returns only
 * the rows whose `businessKey` appears in the scope. Every other role —
 * and a subcontractor with NO scope configured (mis-provisioned account) —
 * passes through unchanged for roles, and gets an EMPTY list for the
 * unscoped subcontractor: failing closed is the right posture for a role
 * whose entire premise is "sees only its own slice".
 *
 * Single composition point: every activity-bearing read surface calls this
 * helper so the rule lives in one place.
 */
export function scopeActivities<T extends { businessKey: string }>(
  user: Pick<User, 'role' | 'activityScope'> | null | undefined,
  rows: T[],
): T[] {
  if (!user || user.role !== Role.SUBCONTRACTOR) return rows;
  const scope = user.activityScope;
  if (!Array.isArray(scope) || scope.length === 0) return [];
  const allowed = new Set(scope);
  return rows.filter((r) => allowed.has(r.businessKey));
}
