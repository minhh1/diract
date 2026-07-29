// lib/columnDefinitions.ts

import { KeyRound } from "lucide-react";

const CREDENTIAL_CATEGORIES = ['Council', 'Electricity', 'Water', 'Land Tax', 'Gas'];

const CREDENTIAL_FIELD_LABELS: { suffix: string; label: string }[] = [
  { suffix: 'account_name', label: 'Account Name' },
  { suffix: 'account_number', label: 'Account Number' },
  { suffix: 'login_id', label: 'Login ID' },
  { suffix: 'nominated_mobile', label: 'Nominated Mobile' },
  { suffix: 'additional_email', label: 'Additional Email' },
  { suffix: 'access_note', label: 'Online Access Note' },
  { suffix: 'nominated_payor', label: 'Payor' },
  { suffix: 'auto_forward_note', label: 'Auto Forward Note' },
  { suffix: 'credential_provider', label: 'Provider (Credential)' },
  { suffix: 'bill_provider', label: 'Provider (Bill)' },
];

export const PROPERTY_COLUMNS = [
  'street_address', 'suburb', 'state', 'postcode', 'country',
  'folio_identifier', 'holding_entity_id', 'purchase_date',
  'insurer_name', 'insurance_expiry', 'purchase_entity_id', 'policy_number',
  'project_manager', 'project_owner', 'last_coc_date', 'council_entity_id',
  'insurer_entity_id', 'is_sold', 'sold_date', 'sold_price',
];

// acn/abn/trust_deed_date used to be here too -- they're company_custom_fields
// now (see supabase/migrations/20260729290000_entities_finance_fields_to_custom.sql).
export const ENTITY_COLUMNS = [
  'name', 'entity_type', 'gst_registered', 'established_date',
];

// purchase_price moved here from PROPERTY_COLUMNS (Client Update Pages --
// see supabase/migrations/20260728130000_projects_purchase_price.sql).
// properties.purchase_price still exists and is still written at
// property-creation time (NewPropertyModal.tsx, RecordCreatorField.tsx,
// the CSV property-import pipeline) since a property isn't always linked
// to a project yet when it's created -- the two can drift.
export const PROJECT_COLUMNS = [
  'name', 'description', 'property_id', 'estimated_completion_date', 'purchase_price',
];

export function buildCredentialColumnSections() {
  return CREDENTIAL_CATEGORIES.map(category => {
    const key = category.toLowerCase().replace(/\s+/g, '_');
    return {
      title: `${category} Details`,
      icon: KeyRound,
      fields: CREDENTIAL_FIELD_LABELS.map(f => ({
        id: `${key}_${f.suffix}`,
        label: `${category} ${f.label}`,
      })),
    };
  });
}
