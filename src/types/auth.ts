export type UserRole = 'Admin' | 'Engineer' | 'Viewer';

export interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  approved: boolean;
}