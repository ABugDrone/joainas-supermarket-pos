import { Capability, CAPABILITY_PRESETS, UserRole, User } from '../types';

// Full access is only granted to accounts holding the 'admin' capability.
// Everyone else can only ever see/do what their capabilities allow.

export const isAdmin = (user: Pick<User, 'capabilities' | 'role'> | null | undefined): boolean =>
  !!user && (user.capabilities || []).includes('admin');

export const can = (user: Pick<User, 'capabilities'> | null | undefined, cap: Capability): boolean => {
  if (!user) return false;
  const caps = user.capabilities || [];
  if (caps.includes('admin')) return true;
  return caps.includes(cap);
};

export const hasAny = (user: Pick<User, 'capabilities'> | null | undefined, caps: Capability[]): boolean =>
  caps.some((c) => can(user, c));

// Sensible default capabilities for a given preset role.
export const defaultCapabilitiesFor = (role: UserRole): Capability[] => {
  const preset = CAPABILITY_PRESETS[role];
  if (preset) return [...preset];
  if (role === 'System Admin') return [...(CAPABILITY_PRESETS['System Admin'] as Capability[])];
  return ['sell', 'view_sales', 'customers', 'receipts', 'printer_settings'];
};
