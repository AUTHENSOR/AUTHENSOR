/**
 * Auth Types
 *
 * Role-based access control types for the control plane.
 */

export type Role = 'ingest' | 'executor' | 'admin';

export interface AuthContext {
  keyId: string;
  role: Role;
  name: string;
}

export interface ApiKey {
  id: string;
  name: string;
  role: Role;
  keyHash: string;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

/**
 * Check if a role has at least the required permission level
 * Role hierarchy: ingest < executor < admin
 */
export function roleHasPermission(userRole: Role, requiredRoles: Role[]): boolean {
  return requiredRoles.includes(userRole);
}

/**
 * Check if role is valid
 */
export function isValidRole(role: string): role is Role {
  return ['ingest', 'executor', 'admin'].includes(role);
}
