// lib/permissions/customRoleSlugs.ts
// Registry of permission slugs a company's own custom role (company_custom_
// roles.permissions, see supabase/migrations/20260808210000_staff_precreate_
// and_custom_roles.sql) can grant. This is the ONE place a new capability
// gets added -- checked against by user_has_custom_permission() (SQL) and
// authorizeCompanyMember()'s hasPermission() (server code), so a new
// action just needs a new entry here plus the actual `if (!isAdmin &&
// !auth.hasPermission(...))` check at its call site, not a schema change.
export interface CustomRoleSlug {
  slug: string;
  label: string;
  description: string;
}

export const CUSTOM_ROLE_SLUGS: CustomRoleSlug[] = [
  {
    slug: "roster.edit",
    label: "Edit roster shifts",
    description: "Create, edit, delete, and copy roster shifts (not publishing them).",
  },
  {
    slug: "roster.publish",
    label: "Publish / confirm roster",
    description: "Mark a week's roster shifts as final, visible to all staff.",
  },
  {
    slug: "calendar.book_events",
    label: "Book calendar events",
    description: "Create, edit, and cancel calendar events, and invite staff or external people to them.",
  },
];

export const CUSTOM_ROLE_SLUG_VALUES = CUSTOM_ROLE_SLUGS.map(s => s.slug);
