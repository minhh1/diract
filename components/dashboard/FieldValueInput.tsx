"use client";

import { useRef, useState } from "react";
import { Sparkles, Loader2, BadgeCheck, AlertCircle } from "lucide-react";
import type { CustomTableField } from "@/lib/hooks/useCustomTable";
import RelationPicker from "./RelationPicker";
import { getValueColumn, isRelationType, isNumericType } from "@/lib/schema/fieldCapabilities";
import { PILL_SIZE_CLASSES, type PillSize } from "@/lib/dashboardWidgets/pillSize";
import { isValidABN, isValidACN } from "@/lib/validation/entityValidation";
import SmartFieldHint from "@/components/SmartFieldHint";
import { useNameQualityCheck } from "@/lib/hooks/useNameQualityCheck";
import type { NameSuggestion } from "@/lib/smartValidation/nameQuality";

// Which company_table_values column stores a given field_type's value.
export const valueColumnFor = getValueColumn;

// 'pill' is the rounded, bordered, placeholder-labelled look used by filter
// bars/quick-add forms (real standalone form controls). 'plain' is a flat
// spreadsheet-cell look with no border/background/placeholder/field-label
// decoration -- used by DashboardGrid, where the column header already
// names the field and every row (filled or still blank) should read like an
// actual spreadsheet cell, not a little form floating in a table.
type Variant = 'pill' | 'plain';

const inputClassFor = (size: PillSize, variant: Variant) =>
  variant === 'plain'
    ? 'w-full bg-transparent outline-none font-medium text-[12px] text-slate-700 px-0.5 py-1 rounded-sm focus:ring-2 focus:ring-indigo-100'
    : `w-full bg-slate-50 border border-slate-200 rounded-full font-medium outline-none focus:ring-2 focus:ring-indigo-100 ${PILL_SIZE_CLASSES[size]}`;

interface Props {
  field: CustomTableField;
  value: any;
  onCommit: (value: any) => void;
  disabled?: boolean;
  // Pre-resolved label for a relation-type value (e.g. CustomTableRecord.
  // displayValues) -- see RelationPicker's initialLabel for why this
  // matters at any real scale of rows.
  displayValue?: string;
  // Visual size (padding/text) -- see lib/dashboardWidgets/pillSize.ts.
  // Undefined means 'md', the size every existing caller (grid cells, etc.)
  // already renders at.
  size?: PillSize;
  // See Variant above. Undefined means 'pill', what every existing caller
  // besides DashboardGrid already renders at.
  variant?: Variant;
  // True when this field is the table's own primary/title field (its
  // company_tables.primary_field_key) -- gates the smart name-quality hint
  // (see lib/smartValidation/nameQuality.ts) onto the 'text' branches below.
  // Every other field type/role never gets it: a description, a select, a
  // number etc. isn't a "name" these checks make sense against.
  isPrimaryField?: boolean;
}

// Renders the appropriate input widget for a custom-table field, bound to a
// value, committing on blur/change. Reuses the field_type conventions shared
// across the schema system (see components/schema/types.ts).
export default function FieldValueInput({ field, value, onCommit, disabled, displayValue, size = 'md', variant = 'pill', isPrimaryField }: Props) {
  const type = field.field_type;
  const inputClass = inputClassFor(size, variant);
  const plain = variant === 'plain';

  // Only ever used by the growing-textarea branch below, but declared here
  // (not inside that `if`) since hooks can't be called conditionally.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);

  // Smart name-quality hint (isPrimaryField only) -- both 'text' branches
  // below are uncontrolled (defaultValue + commit-on-blur), so "Apply" sets
  // the DOM node's value directly (same trick the AI-rewrite button already
  // uses) rather than going through React state.
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const nameQuality = useNameQualityCheck();
  const applyNameSuggestion = (suggestion: NameSuggestion) => {
    if (!suggestion.apply) return;
    const result = suggestion.apply();
    if ("correctedValue" in result && result.correctedValue) {
      const el = textareaRef.current ?? textInputRef.current;
      if (el) {
        el.value = result.correctedValue;
        if (el instanceof HTMLTextAreaElement) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
      }
      onCommit(result.correctedValue);
    }
    nameQuality.dismiss(suggestion.id);
  };

  // Only ever used by the abn/acn branch below, declared here for the same
  // reason as textareaRef above (hooks can't be called conditionally).
  const abnInputRef = useRef<HTMLInputElement | null>(null);
  const [checksumValid, setChecksumValid] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Computed fields are never hand-edited — see supabase/company_table_fields_formula.sql.
  if (field.formula_type) {
    // Formatted per field_type, same convention as every other read-only
    // display of a field value in the app (GenericMasterTable.tsx,
    // CustomTableMasterPage.tsx, ...) -- previously always String(value)
    // regardless of type, so e.g. a max_related field on a date (the
    // "latest end date among a loan's Interest Only phases" case) showed as
    // a raw ISO string ("2027-03-01") instead of a formatted date.
    let display = '';
    if (value !== null && value !== undefined && value !== '') {
      if (field.field_type === 'currency') display = `$${Number(value).toLocaleString()}`;
      else if (field.field_type === 'date') { try { display = new Date(value).toLocaleDateString('en-AU'); } catch { display = String(value); } }
      else display = String(value);
    }
    return (
      <div
        className={plain ? 'w-full text-[12px] font-medium text-slate-500 truncate px-0.5 py-1' : 'w-full bg-slate-50 border border-slate-200 rounded-full py-2 px-3.5 text-[13px] font-medium text-slate-500 truncate'}
        title="Auto-calculated"
      >
        {display || (plain ? '' : '—')}
      </div>
    );
  }

  if (type === 'boolean') {
    return (
      <label className={`flex items-center ${plain ? '' : 'gap-2'} cursor-pointer`}>
        <input
          type="checkbox"
          checked={!!value}
          disabled={disabled}
          onChange={e => onCommit(e.target.checked)}
          className="w-4 h-4 accent-indigo-600"
        />
        {/* Grid columns already name the field via their header -- a
            repeated visible label here would be exactly the "help text"
            a blank spreadsheet cell shouldn't show. Kept for a11y only. */}
        <span className={plain ? 'sr-only' : 'text-[11px] font-medium text-slate-500'}>{field.label}</span>
      </label>
    );
  }

  if (type === 'select') {
    // First-letter keyboard shortcut, e.g. Time & Fee Entries' Type field:
    // "t" picks "Time Based", "f" picks "Fixed Fee" -- immediately (not
    // native <select> typeahead, which just changes the value and keeps
    // focus here) and advances to the next field, for fast keyboard-only
    // entry. Generic over any select field's own option text, not
    // hardcoded to Type -- and scoped to quick-add forms specifically (the
    // [data-quickadd-fields] container DashboardQuickAddForm renders
    // around its fields) so a grid cell's own tab order isn't hijacked and
    // native typeahead still works everywhere else.
    const handleKeyDown = (e: React.KeyboardEvent<HTMLSelectElement>) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      const container = e.currentTarget.closest('[data-quickadd-fields]');
      if (!container) return;
      const match = (field.select_options || []).find(opt => opt[0]?.toLowerCase() === e.key.toLowerCase());
      if (!match) return;
      e.preventDefault();
      e.currentTarget.value = match;
      onCommit(match);
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')
      );
      const idx = focusable.indexOf(e.currentTarget);
      if (idx >= 0 && idx < focusable.length - 1) focusable[idx + 1].focus();
    };
    return (
      <select
        defaultValue={value ?? ''}
        disabled={disabled}
        onChange={e => onCommit(e.target.value || null)}
        onKeyDown={handleKeyDown}
        className={`${inputClass} appearance-none`}
      >
        <option value="">{plain ? '' : '—'}</option>
        {(field.select_options || []).map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  if (type === 'date') {
    return (
      <input
        type="date"
        defaultValue={value ?? ''}
        disabled={disabled}
        onBlur={e => onCommit(e.target.value || null)}
        className={inputClass}
      />
    );
  }

  if (isNumericType(type)) {
    return (
      <input
        type="number"
        defaultValue={value ?? ''}
        disabled={disabled}
        onBlur={e => onCommit(e.target.value === '' ? null : Number(e.target.value))}
        className={inputClass}
        placeholder={plain ? undefined : field.label}
      />
    );
  }

  if (isRelationType(type)) {
    if (field.allow_multiple) {
      return (
        <RelationPicker
          linkedSystemTable={field.linked_system_table}
          linkedTableId={field.linked_system_table ? null : field.linked_table_id}
          displayField={field.linked_display_field}
          displayField2={field.linked_display_field_2}
          searchFieldKeys={field.linked_search_field_keys}
          filterColumn={field.linked_filter_column}
          filterValue={field.linked_filter_value}
          multiple
          values={Array.isArray(value) ? value : []}
          onSelectMulti={ids => onCommit(ids)}
          disabled={disabled}
          placeholder={plain ? '' : field.label}
          size={size}
          variant={variant}
          allowCreateNew
        />
      );
    }
    return (
      <RelationPicker
        linkedSystemTable={field.linked_system_table}
        linkedTableId={field.linked_system_table ? null : field.linked_table_id}
        displayField={field.linked_display_field}
        displayField2={field.linked_display_field_2}
        searchFieldKeys={field.linked_search_field_keys}
        filterColumn={field.linked_filter_column}
        filterValue={field.linked_filter_value}
        value={value || null}
        onSelect={id => onCommit(id)}
        disabled={disabled}
        placeholder={plain ? '' : field.label}
        initialLabel={displayValue}
        size={size}
        variant={variant}
        allowCreateNew
      />
    );
  }

  // ABN/ACN — checksum-validated (isValidABN/isValidACN) with an inline
  // "Verify" button that calls the ABR ABN Lookup web service
  // (app/api/abn-lookup/route.ts) to confirm the number is actually
  // registered, not just structurally well-formed.
  if (type === 'abn' || type === 'acn') {
    const validator = type === 'abn' ? isValidABN : isValidACN;
    const isValid = (v: string) => !v.trim() || validator(v);
    const handleVerify = async () => {
      const raw = abnInputRef.current?.value.trim();
      if (!raw || !validator(raw)) return;
      setVerifying(true);
      setVerifyResult(null);
      setVerifyError(null);
      try {
        const res = await fetch('/api/abn-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, value: raw }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Lookup failed');
        setVerifyResult(json.status ? `${json.entityName} — ${json.status}` : json.entityName || 'No match found');
      } catch (err) {
        setVerifyError(err instanceof Error ? err.message : 'Lookup failed');
      } finally {
        setVerifying(false);
      }
    };
    return (
      <div>
        <div className="relative">
          <input
            ref={abnInputRef}
            type="text"
            defaultValue={value ?? ''}
            disabled={disabled}
            onChange={e => { setChecksumValid(isValid(e.target.value)); setVerifyResult(null); setVerifyError(null); }}
            onBlur={e => onCommit(e.target.value.trim() || null)}
            className={`${inputClass} pr-8 ${!checksumValid ? '!border-red-300 focus:!ring-red-100' : ''}`}
            placeholder={plain ? undefined : field.label}
          />
          {!disabled && (
            <button
              type="button"
              onClick={handleVerify}
              disabled={verifying || !checksumValid || !abnInputRef.current?.value.trim()}
              title={`Verify with ABN Lookup`}
              aria-label="Verify"
              className="absolute top-1/2 -translate-y-1/2 right-2 p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors disabled:opacity-40"
            >
              {verifying ? <Loader2 size={12} className="animate-spin" /> : <BadgeCheck size={12} />}
            </button>
          )}
        </div>
        {!checksumValid && (
          <p className="text-[10px] text-red-500 font-medium mt-1 px-1 flex items-center gap-1">
            <AlertCircle size={10} /> Not a valid {type.toUpperCase()} (fails the checksum)
          </p>
        )}
        {verifyResult && <p className="text-[10px] text-emerald-600 font-medium mt-1 px-1">{verifyResult}</p>}
        {verifyError && <p className="text-[10px] text-red-500 font-medium mt-1 px-1">{verifyError}</p>}
      </div>
    );
  }

  // Plain 'text' in a form (not email/url, not a grid cell) auto-grows
  // instead of using a single-line input -- a single line horizontally
  // scrolls hidden content once a value overflows it (confirmed live on
  // Time & Fee Entries' Description: typing a normal billing-narrative
  // sentence scrolled the start of it off-screen), so there's no way to see
  // or highlight the whole thing without first scrolling to find it. An
  // auto-growing textarea wraps instead, so every character stays visible
  // and selectable and nothing shifts while typing. Scoped to non-'plain'
  // only -- DashboardGrid's rows have a fixed height, so a growing textarea
  // there would misalign against every other cell in the same row.
  if (type === 'text' && !plain) {
    const grow = (el: HTMLTextAreaElement | null) => {
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    // Same "make this professional" rewrite as MyTasksButtonWidget's task
    // notes (app/api/ai/rewrite-text) -- reads/writes the textarea's DOM
    // value directly since it's uncontrolled (defaultValue, commit-on-blur),
    // then feeds the result through the normal onCommit path so it persists
    // exactly like a manual edit would.
    const handleRewrite = async () => {
      const el = textareaRef.current;
      const text = el?.value.trim();
      if (!text) return;
      setRewriting(true);
      setRewriteError(null);
      try {
        const res = await fetch('/api/ai/rewrite-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Rewrite failed');
        if (el) { el.value = json.text; grow(el); }
        onCommit(json.text || null);
      } catch (err) {
        setRewriteError(err instanceof Error ? err.message : 'Rewrite failed');
      } finally {
        setRewriting(false);
      }
    };
    return (
      <div className="relative">
        <textarea
          ref={el => { textareaRef.current = el; grow(el); }}
          defaultValue={value ?? ''}
          disabled={disabled}
          onBlur={e => { onCommit(e.target.value || null); if (isPrimaryField) nameQuality.check(e.target.value); }}
          onInput={e => grow(e.currentTarget)}
          rows={1}
          className={`${inputClass.replace('rounded-full', 'rounded-2xl')} resize-none leading-snug pr-8`}
          placeholder={field.label}
        />
        {isPrimaryField && <SmartFieldHint suggestions={nameQuality.suggestions} onApply={applyNameSuggestion} onDismiss={nameQuality.dismiss} />}
        {!disabled && (
          <button
            type="button"
            onClick={handleRewrite}
            disabled={rewriting}
            title="Rewrite with AI"
            aria-label="Rewrite with AI"
            className="absolute top-1.5 right-1.5 p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors disabled:opacity-50"
          >
            {rewriting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          </button>
        )}
        {rewriteError && <p className="text-[10px] text-red-500 font-medium mt-1 px-1">{rewriteError}</p>}
      </div>
    );
  }

  // email / url / auto_id fallback (and 'text' in a grid cell -- non-'plain'
  // 'text' is already handled by the growing-textarea branch above, so
  // 'text' reaching here is always the 'plain'/grid-cell case)
  return (
    <div>
      <input
        ref={type === 'text' ? textInputRef : undefined}
        type={type === 'email' ? 'email' : type === 'url' ? 'url' : 'text'}
        defaultValue={value ?? ''}
        disabled={disabled}
        onBlur={e => { onCommit(e.target.value || null); if (isPrimaryField && type === 'text') nameQuality.check(e.target.value); }}
        className={inputClass}
        placeholder={plain ? undefined : field.label}
      />
      {isPrimaryField && type === 'text' && (
        <SmartFieldHint suggestions={nameQuality.suggestions} onApply={applyNameSuggestion} onDismiss={nameQuality.dismiss} />
      )}
    </div>
  );
}
