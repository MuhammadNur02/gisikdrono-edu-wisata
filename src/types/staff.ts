// The signed-in staff member's own profile as the dashboard shows it (the session client reads it under RLS).
export interface StaffProfile {
  fullName: string;
  email: string;
}
