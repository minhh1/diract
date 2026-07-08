// lib/import/parseImportFile.ts

import { supabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────────

export interface ParseFileOptions {
  baseMode: 'properties' | 'entities' | 'projects';
  sectionIsBase: boolean;
}

export interface ParsedRow {
  rowIndex: number;
  raw: Record<string, string>;
  parsed: Record<string, any>;
  customFields: Record<string, string>;     // fieldId → value
  relatedFields: Record<string, Record<string, string>>; // alias → { fieldName: value }
}

// ── AU address parser ──────────────────────────────────────────────

interface ParsedAddress {
  street_address: string;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
}

function parseAUAddress(raw: string): ParsedAddress {
  if (!raw?.trim()) {
    return { street_address: '', suburb: '', state: '', postcode: '', country: 'Australia' };
  }

  const clean = raw.trim().replace(/\s+/g, ' ');

  // Pattern: "12 Baker Street, Suburb NSW 2000"
  // or "12 Baker Street Suburb NSW 2000"
  const statePostcodeMatch = clean.match(
    /^(.+?)[,\s]+([\w\s]+?)\s+(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\s+(\d{4})\s*(?:Australia)?$/i
  );

  if (statePostcodeMatch) {
    const streetAndSuburb = statePostcodeMatch[1].trim();
    const suburb = statePostcodeMatch[2].trim();
    const state = statePostcodeMatch[3].toUpperCase();
    const postcode = statePostcodeMatch[4];

    return {
      street_address: streetAndSuburb,
      suburb,
      state,
      postcode,
      country: 'Australia',
    };
  }

  // Fallback — just use the whole string as street address
  return {
    street_address: clean,
    suburb: '',
    state: '',
    postcode: '',
    country: 'Australia',
  };
}

// ── AU date parser ─────────────────────────────────────────────────
// Handles: DD/MM/YYYY, YYYY-MM-DD, D MMM YYYY, DD-MM-YYYY

function parseAUDate(raw: string): string | null {
  if (!raw?.trim()) return null;

  const clean = raw.trim();

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    return clean.slice(0, 10);
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // D MMM YYYY or DD MMM YYYY
  const textMonth = clean.match(
    /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})$/i
  );
  if (textMonth) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04',
      may: '05', jun: '06', jul: '07', aug: '08',
      sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const [, d, m, y] = textMonth;
    return `${y}-${months[m.toLowerCase()]}-${d.padStart(2, '0')}`;
  }

  return null;
}

// ── Currency parser ────────────────────────────────────────────────

function parseCurrency(raw: string): number {
  if (!raw?.trim()) return 0;
  const clean = raw.replace(/[$,\s]/g, '').trim();
  return parseFloat(clean) || 0;
}

// ── CSV line splitter — handles quoted fields with commas ──────────

export function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// ── Main parser ────────────────────────────────────────────────────

export function parseImportFile(
  text: string,
  options: ParseFileOptions,
  customFieldMap?: Map<string, string>
): { headers: string[]; rows: ParsedRow[] } {

  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter(l => l.trim());

  if (lines.length < 2) return { headers: [], rows: [] };

  const rawHeaders = splitCSVLine(lines[0]).map(
    h => h.replace(/^"|"$/g, '').trim()
  );

  // ── Resolve headers ──────────────────────────────────────────────
  // Convert human-readable labels to internal keys:
  // "Billing Type"   → "custom:uuid:billing_type"  (via customFieldMap)
  // "Street Address" → "street_address"              (snake_case fallback)
  // "custom:uuid:key"→ unchanged                     (already prefixed)

  const resolvedHeaders = rawHeaders.map(h => {
    // Already prefixed — leave as-is
    if (h.startsWith('custom:') || h.startsWith('relation:')) return h;

    if (customFieldMap) {
      // Try exact label match (case-insensitive): "Billing Type"
      const byLabel = customFieldMap.get(h.toLowerCase().trim());
      if (byLabel) return byLabel;

      // Try snake_case of label: "billing_type"
      const bySnake = customFieldMap.get(
        h.toLowerCase().trim().replace(/\s+/g, '_')
      );
      if (bySnake) return bySnake;
    }

    // Base column — snake_case it
    return h.toLowerCase().trim().replace(/\s+/g, '_');
  });

  console.log('Raw headers:', rawHeaders);
  console.log('Resolved headers:', resolvedHeaders);

  const { baseMode, sectionIsBase } = options;

  // ── Parse rows ───────────────────────────────────────────────────

  const rows: ParsedRow[] = lines.slice(1).map((line, idx) => {
    const values = splitCSVLine(line);

    const raw: Record<string, string> = {};
    resolvedHeaders.forEach((h, i) => {
      raw[h] = (values[i] ?? '').replace(/^"|"$/g, '').trim();
    });

    const parsed: Record<string, any> = {};
    const customFields: Record<string, string> = {};
    const relatedFields: Record<string, Record<string, string>> = {};

    resolvedHeaders.forEach(header => {
      const val = raw[header] ?? '';

      // ── Custom field column ──────────────────────────────────────
      if (header.startsWith('custom:')) {
        const parts = header.split(':');
        const fieldId = parts[1];
        if (fieldId && val) customFields[fieldId] = val;
        return;
      }

      // ── Cross-table / relation column ────────────────────────────
      if (header.startsWith('relation:')) {
        const path = header.replace('relation:', '');
        const dotIdx = path.indexOf('.');
        if (dotIdx === -1) return;
        const alias = path.slice(0, dotIdx);
        const fieldName = path.slice(dotIdx + 1);
        if (val) {
          if (!relatedFields[alias]) relatedFields[alias] = {};
          relatedFields[alias][fieldName] = val;
        }
        return;
      }

      // ── Base column ──────────────────────────────────────────────
      switch (header) {
        // Properties — full address auto-split
        case 'full_address':
          if (baseMode === 'properties' && sectionIsBase) {
            Object.assign(parsed, parseAUAddress(val));
          } else {
            parsed[header] = val || null;
          }
          break;

        // Projects — property street address for child matching
        case 'property_street_address':
          if (!sectionIsBase) {
            const addr = parseAUAddress(val);
            parsed.property_street_address = addr.street_address;
            parsed.property_suburb = addr.suburb;
          } else {
            parsed[header] = val || null;
          }
          break;

        // Currency fields
        case 'purchase_price':
        case 'amount':
        case 'expected_amount':
          parsed[header] = parseCurrency(val);
          break;

        // Date fields
        case 'purchase_date':
        case 'valuation_date':
        case 'trust_deed_date':
        case 'established_date':
        case 'issued_date':
        case 'paid_up_to':
        case 'date_opened':
        case 'date_closed':
        case 'estimated_completion_date':
        case 'last_coc_date':
          parsed[header] = parseAUDate(val);
          break;

        // Boolean fields
        case 'is_paid':
        case 'gst_registered':
        case 'is_full_valuation':
        case 'email_notices':
          parsed[header] = ['true', 'yes', '1', 'y'].includes(
            val.toLowerCase().trim()
          );
          break;

        // Entity fields — handled separately in commitImport
        case 'entity_name':
          parsed.entity_name = val || null;
          break;

        case 'entity_type':
          parsed.entity_type = val || null;
          break;

        // Provider entity for bills
        case 'provider_entity_name':
          parsed.provider_entity_name = val || null;
          break;

        case 'provider_entity_type':
          parsed.provider_entity_type = val || null;
          break;

        // All other base columns — pass through as text
        default:
          // Skip empty values entirely rather than writing null
          if (val) parsed[header] = val;
          break;
      }
    });

    return {
      rowIndex: idx + 1,
      raw,
      parsed,
      customFields,
      relatedFields,
    };
  });

  return { headers: resolvedHeaders, rows };
}

// ── Auto-detect section from headers ──────────────────────────────
// Used by ImportModal to auto-switch to the right section
// when the user uploads a file

export function detectSection(
  headers: string[],
  sections: { key: string; title: string; headers: string[] }[]
): string | null {
  const headerSet = new Set(
    headers.map(h => h.toLowerCase().trim().replace(/\s+/g, '_'))
  );

  let bestMatch: string | null = null;
  let bestScore = 0;

  sections.forEach(section => {
    const sectionHeaders = new Set(
      section.headers.map(h => h.toLowerCase())
    );
    let score = 0;
    headerSet.forEach(h => {
      if (sectionHeaders.has(h)) score++;
    });
    const ratio = score / Math.max(sectionHeaders.size, 1);
    if (ratio > bestScore && ratio > 0.4) {
      bestScore = ratio;
      bestMatch = section.key;
    }
  });

  return bestMatch;
}