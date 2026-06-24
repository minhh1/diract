import { supabase } from "@/lib/supabase";
import { PROPERTY_COLUMNS, ENTITY_COLUMNS, PROJECT_COLUMNS } from "@/lib/columnDefinitions";

const ALLOW_LISTS: Record<string, string[]> = {
  properties: PROPERTY_COLUMNS,
  entities: ENTITY_COLUMNS,
  projects: PROJECT_COLUMNS,
};

const LINKED_ENTRY_COLUMNS: Record<string, string[]> = {
  properties: ['entity_name', 'entity_type'],
  entities: [],
  projects: [],
};

const COLLAPSE_INTO: Record<string, { collapsedName: string; replaces: string[] }[]> = {
  properties: [
    { collapsedName: 'full_address', replaces: ['street_address', 'suburb', 'state', 'postcode'] },
  ],
  entities: [],
  projects: [],
};

export interface ImportSection {
  key: string;            // unique id, also used as the downloaded filename suffix
  title: string;          // shown to the user (e.g. "Electricity bills")
  targetTable: string;    // the real table this section's rows get written to
  parentKey: 'property_id' | 'entity_id' | 'project_id';
  headers: string[];      // resolved CSV header row for this section
  fixedValues?: Record<string, string>; // values auto-filled for this section, not user-entered (e.g. category)
}

// Bills: 5 repeated sections sharing one table per category, each with a
// provider_entity link (resolved the same way holding_entity works for
// properties — by provider_entity_name/provider_entity_type pseudo-columns).
const BILL_HEADERS = [
  'issued_date', 'amount', 'is_paid', 'paid_up_to',
  'expected_amount', 'expected_amount_period', 'notes',
  'e_notice_reference', 'email_notices',
  'provider_entity_name', 'provider_entity_type',
];

const BILL_SECTIONS: Omit<ImportSection, 'headers'>[] = [
  { key: 'bills_local_government', title: 'Local government bills', targetTable: 'property_bills_local_government', parentKey: 'property_id' },
  { key: 'bills_electricity', title: 'Electricity bills', targetTable: 'property_bills_electricity', parentKey: 'property_id' },
  { key: 'bills_water', title: 'Water bills', targetTable: 'property_bills_water', parentKey: 'property_id' },
  { key: 'bills_gas', title: 'Gas bills', targetTable: 'property_bills_gas', parentKey: 'property_id' },
  { key: 'bills_land_tax', title: 'Land tax bills', targetTable: 'property_bills_land_tax', parentKey: 'property_id' },
];

// Credentials: ONE physical table (property_credentials), but 5 repeated
// import sections — one per service category — since each category is
// filled in separately by the user, per your instruction. "fixedValues"
// pins the category column so the import engine knows which value to
// write without the user re-typing it on every row.
const CREDENTIAL_HEADERS = [
  'account_name', 'account_number', 'login_id', 'nominated_mobile',
  'additional_email', 'access_note', 'nominated_payor', 'auto_forward_note',
  'provider_entity_name', 'provider_entity_type',
];
// Deliberately excluded: encrypted_password — never importable via CSV,
// since plaintext passwords should never travel through a spreadsheet.

const CREDENTIAL_CATEGORIES: { key: string; title: string; category: string }[] = [
  { key: 'credentials_council', title: 'Council credentials', category: 'Council' },
  { key: 'credentials_electricity', title: 'Electricity credentials', category: 'Electricity' },
  { key: 'credentials_water', title: 'Water credentials', category: 'Water' },
  { key: 'credentials_land_tax', title: 'Land tax credentials', category: 'Land Tax' },
  { key: 'credentials_gas', title: 'Gas credentials', category: 'Gas' },
];

// Simple one-table relations, discoverable without per-category repetition.
const SIMPLE_RELATIONS: Omit<ImportSection, 'headers'>[] = [
  { key: 'valuations', title: 'Property valuations', targetTable: 'property_valuations', parentKey: 'property_id' },
  { key: 'property_me', title: 'Property Me', targetTable: 'property_me', parentKey: 'property_id' },
];

async function getLiveColumns(table: string): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('get_table_columns', { table_name_input: table });
  if (error || !data) {
    console.error(`getLiveColumns(${table}) failed`, error);
    return new Set();
  }
  return new Set(data.map((c: any) => c.col_name));
}

// Metadata/relational columns never offered as CSV headers for ANY
// table — these are system-managed or resolved via pseudo-columns instead.
const ALWAYS_EXCLUDE = new Set([
  'id', 'created_at', 'updated_at', 'deleted_at', 'import_id',
  'company_id', 'property_id', 'entity_id', 'project_id',
  'holding_entity_id', 'provider_entity_id', 'property_credential_id',
  'encrypted_password', // never importable, regardless of table
]);

export async function buildBaseTemplate(mode: 'properties' | 'entities' | 'projects'): Promise<string> {
  const liveColumnNames = await getLiveColumns(mode);
  const allowList = ALLOW_LISTS[mode] || [];

  let headers = allowList.filter(col => liveColumnNames.has(col));

  const collapses = COLLAPSE_INTO[mode] || [];
  collapses.forEach(({ collapsedName, replaces }) => {
    const anyPresent = replaces.some(r => headers.includes(r));
    if (anyPresent) {
      headers = headers.filter(h => !replaces.includes(h));
      headers.unshift(collapsedName);
    }
  });

  headers = [...headers, ...(LINKED_ENTRY_COLUMNS[mode] || [])];
  return headers.join(',');
}

/**
 * Returns every importable section for a given mode: the base table
 * template plus every related-table section that links back to it
 * (bills x5, credentials x5, valuations, property_me, etc, for
 * properties — extend similarly for entities/projects as those grow).
 */
export async function buildAllSections(mode: 'properties' | 'entities' | 'projects'): Promise<ImportSection[]> {
  const sections: ImportSection[] = [];

  const baseHeaders = await buildBaseTemplate(mode);
  sections.push({
    key: mode, title: `${mode.charAt(0).toUpperCase() + mode.slice(1)} (base)`,
    targetTable: mode, parentKey: mode === 'properties' ? 'property_id' : mode === 'entities' ? 'entity_id' : 'project_id',
    headers: baseHeaders.split(','),
  });

  if (mode === 'properties') {
    for (const bill of BILL_SECTIONS) {
      const live = await getLiveColumns(bill.targetTable);
      const headers = BILL_HEADERS.filter(h =>
        ALWAYS_EXCLUDE.has(h) ? false : (live.has(h) || h.startsWith('provider_entity_'))
      );
      sections.push({ ...bill, headers });
    }

    const credLive = await getLiveColumns('property_credentials');
    for (const cred of CREDENTIAL_CATEGORIES) {
      const headers = CREDENTIAL_HEADERS.filter(h =>
        ALWAYS_EXCLUDE.has(h) ? false : (credLive.has(h) || h.startsWith('provider_entity_'))
      );
      sections.push({
        key: cred.key, title: cred.title, targetTable: 'property_credentials',
        parentKey: 'property_id', headers, fixedValues: { category: cred.category },
      });
    }

    for (const rel of SIMPLE_RELATIONS) {
      const live = await getLiveColumns(rel.targetTable);
      const headers = Array.from(live).filter(c => !ALWAYS_EXCLUDE.has(c));
      sections.push({ ...rel, headers });
    }
  }

  return sections;
}

/**
 * Downloads ONE combined CSV-template ZIP-free package: actually, since a
 * single CSV can only represent one table's rows, this returns a single
 * text blob with each section's headers as a labeled block — readable as
 * a reference document, while the actual import still happens one
 * section/file at a time via the section picker in the UI.
 */
export async function buildReferenceDocument(mode: 'properties' | 'entities' | 'projects'): Promise<string> {
  const sections = await buildAllSections(mode);
  return sections.map(s =>
    `# ${s.title} (table: ${s.targetTable})\n${s.headers.join(',')}`
  ).join('\n\n');
}