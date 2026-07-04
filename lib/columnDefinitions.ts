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
  'folio_identifier', 'holding_entity_id', 'purchase_price', 'purchase_date',
  'insurer_name', 'insurance_expiry', 'purchase_entity_id', 'policy_number',
  'project_manager', 'project_owner', 'last_coc_date', 'council_entity_id',
  'insurer_entity_id', 'is_sold', 'sold_date', 'sold_price',
];

export const ENTITY_COLUMNS = [
  'name', 'entity_type', 'acn', 'abn', 'gst_registered',
  'trust_deed_date', 'established_date',
];

export const PROJECT_COLUMNS = [
  'name', 'description', 'property_id', 'estimated_completion_date',
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
