// Mirrors the Postgres enums; the migrations are the source of truth (CLAUDE.md §6.3).
export const APP_ROLES = ['superadmin', 'admin_rw', 'none'] as const;
export type AppRole = (typeof APP_ROLES)[number];
