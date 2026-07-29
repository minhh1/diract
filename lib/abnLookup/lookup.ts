// Live registry lookups against the Australian Business Register's free ABN
// Lookup web service (abr.business.gov.au), called directly with fetch (same
// raw-fetch approach as lib/sms/sendMessage.ts) -- no SDK exists for this
// API. Uses the single platform-owned GUID (ABN_LOOKUP_GUID), not per-company
// credentials -- see .env.example. Response shape confirmed live against
// https://abr.business.gov.au/json/AbnDetails.aspx.
export interface AbnLookupResult {
  abn: string;
  acn: string;
  entityName: string;
  entityTypeName: string;
  status: string; // e.g. "Active", "Cancelled"
  statusEffectiveFrom: string;
  gst: string | null;
  addressState: string;
  addressPostcode: string;
  businessNames: string[];
}

// The JSON endpoints are JSONP-only (no plain-JSON mode) -- every response
// is wrapped as `<callback>({...})`, which has to be stripped before parsing.
function parseJsonp(text: string): any {
  const match = text.match(/^\s*[\w$]+\(([\s\S]*)\)\s*;?\s*$/);
  return JSON.parse(match ? match[1] : text);
}

async function callAbr(path: 'AbnDetails.aspx' | 'AcnDetails.aspx', param: 'abn' | 'acn', value: string): Promise<AbnLookupResult> {
  const guid = process.env.ABN_LOOKUP_GUID;
  if (!guid) throw new Error('ABN Lookup is not configured (ABN_LOOKUP_GUID)');

  const cleaned = value.replace(/\s/g, '');
  const url = `https://abr.business.gov.au/json/${path}?${param}=${encodeURIComponent(cleaned)}&guid=${encodeURIComponent(guid)}&callback=cb`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`ABN Lookup failed: ${res.status} ${text}`);

  const json = parseJsonp(text);
  const found = Boolean(json.EntityName || json.Abn);
  if (!found) throw new Error(json.Message || 'No matching business found');

  return {
    abn: json.Abn ?? '',
    acn: json.Acn ?? '',
    entityName: json.EntityName ?? '',
    entityTypeName: json.EntityTypeName ?? '',
    status: json.AbnStatus ?? '',
    statusEffectiveFrom: json.AbnStatusEffectiveFrom ?? '',
    gst: json.Gst ?? null,
    addressState: json.AddressState ?? '',
    addressPostcode: json.AddressPostcode ?? '',
    businessNames: Array.isArray(json.BusinessName) ? json.BusinessName : [],
  };
}

export function lookupAbn(abn: string): Promise<AbnLookupResult> {
  return callAbr('AbnDetails.aspx', 'abn', abn);
}

export function lookupAcn(acn: string): Promise<AbnLookupResult> {
  return callAbr('AcnDetails.aspx', 'acn', acn);
}
