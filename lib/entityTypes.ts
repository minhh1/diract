// The canonical list of entities.entity_type / roles values, shared between
// components/NewEntityModal.tsx (create form's Classification dropdown) and
// components/dashboard/RecordDashboard.tsx (the generic per-record editor's
// multi-select "Entity Type" field, backed by entities.roles -- see
// supabase/migrations/20260729420000_entities_multi_role.sql). Previously
// duplicated inline in NewEntityModal.tsx only; hoisted here once a second
// consumer needed the identical list.
export const ENTITY_TYPES = [
  'Company', 'Individual', 'Corporate Trustee', 'Non Corporate Trustee',
  'Discretionary Family Trust', 'Fixed Unit Trust',
  'Lawyer', 'Accountant', 'Mortgage Broker', 'Real Estate Agent',
  'Local Council', 'Bank', 'Staff', 'Other',
];
