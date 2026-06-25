"use client";

import { useState, useRef, useEffect } from "react";
import { X, Loader2, ArrowLeft, ArrowRight, AlertTriangle, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";

import FileUploader from "./import/FileUploader";
import ImportResultsTable from "./import/ImportResultsTable";

import { buildAllSections, type ImportSection } from "@/lib/import/buildTemplate";
import { stageAndCheckProperties, stageAndCheckEntities, clearStaging, type StagingFlag } from "@/lib/import/stagingCheck";
import { resolvePropertyParent, resolveEntityParent, resolveProjectParent } from "@/lib/import/parentResolver";

type Stage = "upload" | "checking" | "review" | "committing" | "results";
type RowAction = "include" | "skip" | "update";
type BaseMode = "properties" | "entities" | "projects";

interface ParsedRow {
  rowIndex: number;
  raw: Record<string, string>;
  parsed: Record<string, any>;
}

interface ImportRowResult {
  id: string;
  status: "new" | "updated" | "failed" | "reversed";
  identifier: string;
  message?: string;
  details?: any;
}

const BLOCKING_SCORE = 3;

export default function ImportModal({ isOpen, onClose, onRefresh }: any) {
  const [stage, setStage] = useState<Stage>("upload");
  const [baseMode, setBaseMode] = useState<BaseMode>("properties");
  const [sections, setSections] = useState<ImportSection[]>([]);
  const [sectionKey, setSectionKey] = useState<string>("properties");
  const [loadingSections, setLoadingSections] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [stagingFlags, setStagingFlags] = useState<StagingFlag[]>([]);
  const [rowActions, setRowActions] = useState<Map<number, RowAction>>(new Map());
  const [rowUpdateTarget, setRowUpdateTarget] = useState<Map<number, string>>(new Map());
  const [rowParentWarnings, setRowParentWarnings] = useState<Map<number, string>>(new Map());
  const [editingCell, setEditingCell] = useState<{ row: number; field: string } | null>(null);

  const [results, setResults] = useState<ImportRowResult[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);

  const currentSection = sections.find(s => s.key === sectionKey);
  const isBaseSection = currentSection ? currentSection.targetTable === baseMode : true;

  // Refs mirroring the latest section/mode state. Every async function
  // below (handleAnalyze, handleCommit, and their helpers) reads from
  // these refs instead of closing over currentSection/isBaseSection/
  // baseMode directly. This guarantees they always see what's ACTUALLY
  // selected at the moment they run their core logic, regardless of any
  // render/closure timing — this is the fix for the bug where
  // handleAnalyze was observed to read currentSection.targetTable as
  // "properties" even though the dropdown visibly showed a different
  // section selected at click time.
  const currentSectionRef = useRef(currentSection);
  const isBaseSectionRef = useRef(isBaseSection);
  const baseModeRef = useRef(baseMode);

  useEffect(() => { currentSectionRef.current = currentSection; }, [currentSection]);
  useEffect(() => { isBaseSectionRef.current = isBaseSection; }, [isBaseSection]);
  useEffect(() => { baseModeRef.current = baseMode; }, [baseMode]);
  useEffect(() => {
  console.log('DEBUG5 ImportModal MOUNTED');
  return () => console.log('DEBUG5 ImportModal UNMOUNTING');
}, []);

  useEffect(() => {
    if (!isOpen) return;
    console.log('DEBUG4 buildAllSections effect firing, baseMode:', baseMode);
    setLoadingSections(true);
    buildAllSections(baseMode).then(s => {
      setSections(s);
      setSectionKey(baseMode);
      setLoadingSections(false);
    });
  }, [baseMode, isOpen]);

  // --- ADDRESS PARSER (kept exactly as original) ---
  const parseAUAddress = (fullStr: string) => {
    const res = { street_address: fullStr, suburb: "", state: "NSW", postcode: "" };
    if (!fullStr) return res;
    const ids = ["Street", "St", "Drive", "Dr", "Road", "Rd", "Avenue", "Ave", "Crescent", "Cres", "Parade", "Pde", "Close", "Cl", "Place", "Pl", "Court", "Ct", "Lane", "Ln"];
    try {
      const clean = fullStr.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
      const words = clean.split(' ');
      let splitIdx = -1;
      for (let i = 0; i < words.length; i++) {
        if (ids.some(id => id.toLowerCase() === words[i].toLowerCase())) { splitIdx = i; break; }
      }
      if (splitIdx !== -1) {
        res.street_address = words.slice(0, splitIdx + 1).join(' ');
        const remainder = words.slice(splitIdx + 1);
        if (remainder.length > 0 && /^\d{4}$/.test(remainder[remainder.length - 1])) res.postcode = remainder.pop() || "";
        if (remainder.length > 0 && remainder[remainder.length - 1].length <= 3) res.state = remainder.pop()?.toUpperCase() || "NSW";
        res.suburb = remainder.join(' ');
      }
    } catch (e) { console.error("Address parse logic failed"); }
    return res;
  };

  const splitCSVLine = (text: string) => {
    const result: string[] = [];
    let cur = ""; let inQuotes = false;
    for (const char of text) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) { result.push(cur.trim()); cur = ""; }
      else cur += char;
    }
    result.push(cur.trim());
    return result;
  };

  const parseAUDate = (val: string): string | null => {
    const v = (val || '').trim();
    if (!v) return null;
    const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return v;
    const dmy = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (dmy) {
      let [, d, m, y] = dmy;
      if (y.length === 2) y = `20${y}`;
      const day = d.padStart(2, '0'); const month = m.padStart(2, '0');
      if (Number(month) > 12) return null;
      return `${y}-${month}-${day}`;
    }
    return null;
  };

  const resetAll = () => {
    if (batchId) clearStaging(batchId);
    setStage("upload"); setFile(null); setParsedRows([]); setStagingFlags([]);
    setRowActions(new Map()); setRowUpdateTarget(new Map()); setRowParentWarnings(new Map());
    setResults([]); setBatchId(null);
  };

  // --- STAGE 1 -> 2: parse, stage (base sections only), run duplicate/parent checks ---
  const handleAnalyze = async () => {
    const section = currentSectionRef.current;
    const mode = baseModeRef.current;
    if (!file || !section) return;
    const sectionIsBase = section.targetTable === mode;
    console.log('DEBUG3 sectionKey:', sectionKey, 'sections.map(s=>s.key):', sections.map(s => s.key));
    console.log('DEBUG2 section.targetTable:', section?.targetTable, 'mode:', mode, 'sectionIsBase:', sectionIsBase);
    setStage("checking");

    const text = await file.text();
    const lines = text.replace(/\r/g, '').split('\n').filter(r => r.trim());
    if (lines.length < 2) { alert("This file has no data rows."); setStage("upload"); return; }
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));

    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from("profiles").select("company_id").eq("id", user?.id).single();
    const uid = user?.id || ''; const cid = prof?.company_id || '';
    setUserId(uid); setCompanyId(cid);

    const newBatchId = crypto.randomUUID();
    setBatchId(newBatchId);

    const parsed: ParsedRow[] = lines.slice(1).map((line, idx) => {
      const values = splitCSVLine(line);
      const raw: Record<string, string> = {};
      headers.forEach((h, i) => { raw[h] = values[i] ?? ''; });
      const row: Record<string, any> = {};

      headers.forEach((header) => {
        const val = raw[header];
        if (header === 'full_address' && mode === 'properties' && sectionIsBase) {
          Object.assign(row, parseAUAddress(val));
        } else if (header === 'property_street_address' && !sectionIsBase) {
          const addr = parseAUAddress(val);
          row.property_street_address = addr.street_address;
          row.property_suburb = addr.suburb;
        } else if (header === 'purchase_price' || header === 'amount' || header === 'expected_amount') {
          row[header] = parseFloat(val.replace(/[$,\s]/g, '')) || 0;
        } else if (header.includes('date') || header.includes('expiry') || header === 'paid_up_to') {
          row[header] = parseAUDate(val);
        } else if (header === 'is_paid' || header === 'gst_registered') {
          row[header] = ['true', 'yes', '1'].includes(val.toLowerCase());
        } else {
          row[header] = val || null;
        }
      });

      return { rowIndex: idx + 1, raw, parsed: row };
    });

    setParsedRows(parsed);

    let flags: StagingFlag[] = [];
    const actions = new Map<number, RowAction>();
    const updateTargets = new Map<number, string>();

    if (sectionIsBase) {
      try {
        if (mode === 'properties') {
          flags = await stageAndCheckProperties(newBatchId, uid, cid, parsed.map(r => ({
            row_index: r.rowIndex, street_address: r.parsed.street_address, suburb: r.parsed.suburb,
            state: r.parsed.state, postcode: r.parsed.postcode, purchase_price: r.parsed.purchase_price,
            purchase_date: r.parsed.purchase_date, entity_name: r.parsed.entity_name || null, raw_payload: r.parsed,
          })));
        } else if (mode === 'entities') {
          flags = await stageAndCheckEntities(newBatchId, uid, cid, parsed.map(r => ({
            row_index: r.rowIndex, name: r.parsed.entity_name || r.parsed.name, raw_payload: r.parsed,
          })));
        }
      } catch (err: any) {
        alert(`Duplicate check failed: ${err.message}. You can still review and commit manually.`);
      }

      parsed.forEach(row => {
        const rowFlags = flags.filter(f => f.staging_row_index === row.rowIndex);
        const blockingFlag = rowFlags.find(f => (f.match_score ?? 99) >= BLOCKING_SCORE || f.match_reason?.includes('Pty/Ltd'));
        const existingMatch = rowFlags.find(f => f.matched_against === 'existing' && f.matched_id);

        if (existingMatch) {
          updateTargets.set(row.rowIndex, existingMatch.matched_id!);
          actions.set(row.rowIndex, 'update');
        } else if (blockingFlag) {
          actions.set(row.rowIndex, 'skip');
        } else {
          actions.set(row.rowIndex, 'include');
        }
      });
    } else {
      const warnings = new Map<number, string>();
      for (const row of parsed) {
        actions.set(row.rowIndex, 'include');
        const refAddress = row.parsed.property_street_address;
        const refSuburb = row.parsed.property_suburb;
        if (section.parentKey === 'property_id' && refAddress) {
          let query = supabase
            .from('properties').select('id').eq('company_id', cid)
            .ilike('street_address', refAddress.trim()).is('deleted_at', null);
          if (refSuburb) query = query.ilike('suburb', refSuburb.trim());
          const { data: existing } = await query.limit(1).single();
          if (!existing) warnings.set(row.rowIndex, `Property "${refAddress}" not found — a new minimal property record will be created.`);
        }
      }
      setRowParentWarnings(warnings);
    }

    setStagingFlags(flags);
    setRowActions(actions);
    setRowUpdateTarget(updateTargets);
    setStage("review");
  };

  const cycleRowAction = (rowIndex: number) => {
    const hasExistingMatch = rowUpdateTarget.has(rowIndex);
    setRowActions(prev => {
      const next = new Map(prev);
      const current = next.get(rowIndex) || 'include';
      if (current === 'include') next.set(rowIndex, 'skip');
      else if (current === 'skip') next.set(rowIndex, hasExistingMatch ? 'update' : 'include');
      else next.set(rowIndex, 'include');
      return next;
    });
  };

  const handleEditCell = (rowIndex: number, field: string, value: string) => {
    setParsedRows(prev => prev.map(r => r.rowIndex === rowIndex ? { ...r, parsed: { ...r.parsed, [field]: value } } : r));
  };

  const blockedRowsSetToInclude = parsedRows.filter(row => {
    const flags = stagingFlags.filter(f => f.staging_row_index === row.rowIndex);
    const isBlocking = flags.some(f => (f.match_score ?? 99) >= BLOCKING_SCORE || f.match_reason?.includes('Pty/Ltd'));
    return isBlocking && (rowActions.get(row.rowIndex) || 'include') === 'include';
  });

  const resolveProviderEntity = async (row: Record<string, any>, cid: string): Promise<string | null> => {
    if (!row.provider_entity_name) return null;
    const res = await resolveEntityParent(cid, row.provider_entity_name, row.provider_entity_type);
    return res.id;
  };

  // --- STAGE 3 -> 4: commit ---
  const handleCommit = async () => {
    const section = currentSectionRef.current;
    const mode = baseModeRef.current;
    if (!companyId || !section) return;
    const sectionIsBase = section.targetTable === mode;

    if (blockedRowsSetToInclude.length > 0) {
      const proceed = window.confirm(`${blockedRowsSetToInclude.length} row(s) flagged as likely duplicates are still set to create a new record. Continue anyway?`);
      if (!proceed) return;
    }

    setStage("committing");
    const importLogs: ImportRowResult[] = [];
    const rowsToProcess = parsedRows.filter(r => (rowActions.get(r.rowIndex) || 'include') !== 'skip');

    for (const row of rowsToProcess) {
      const action = rowActions.get(row.rowIndex) || 'include';

      if (sectionIsBase) {
        await commitBaseRow(row, action, mode, importLogs);
      } else {
        await commitChildRow(row, section, importLogs);
      }
    }

    parsedRows.forEach(row => {
      if ((rowActions.get(row.rowIndex) || 'include') === 'skip') {
        importLogs.push({
          id: '', status: 'failed',
          identifier: row.parsed.street_address || row.parsed.entity_name || row.parsed.name || `Row ${row.rowIndex}`,
          message: 'Skipped by user during review', details: row.parsed,
        });
      }
    });

    await supabase.from("import_history").insert([{
      id: batchId, user_id: userId, company_id: companyId, target_table: section.targetTable,
      filename: file?.name, total_rows: parsedRows.length,
      success_count: importLogs.filter(r => r.status === 'new' || r.status === 'updated').length,
      error_count: importLogs.filter(r => r.status === 'failed').length,
      results_json: importLogs,
    }]);

    if (batchId) await clearStaging(batchId);
    setResults(importLogs);
    setStage("results");
    onRefresh();
  };

  const commitBaseRow = async (row: ParsedRow, action: RowAction, mode: BaseMode, importLogs: ImportRowResult[]) => {
    const obj: any = { company_id: companyId, import_id: batchId };
    let eName = ""; let eType = "";

    Object.entries(row.parsed).forEach(([header, val]) => {
      if (header === 'full_address') return;
      if (header === 'entity_name') { eName = String(val ?? ''); return; }
      if (header === 'entity_type') { eType = String(val ?? ''); if (mode !== 'entities') return; }
      obj[header] = val;
    });

    if (mode === 'properties' && eName) {
      const { data: ent } = await supabase.from("entities")
        .upsert({ name: eName, entity_type: eType || 'Company', company_id: companyId }, { onConflict: 'company_id,name' })
        .select('id').single();
      if (ent) obj.holding_entity_id = ent.id;
    }
    if (mode === 'entities') { obj.name = eName || obj.name; obj.entity_type = eType || obj.entity_type; }

    if (action === 'update') {
      const targetId = rowUpdateTarget.get(row.rowIndex);
      if (!targetId) {
        importLogs.push({ id: '', status: "failed", identifier: obj.street_address || obj.name || `Row ${row.rowIndex}`, message: "No existing record found to update against", details: obj });
        return;
      }
      const updatePayload: Record<string, any> = {};
      Object.entries(obj).forEach(([key, value]) => {
        if (key === 'company_id' || key === 'import_id') return;
        const isEmpty = value === null || value === undefined || value === '' || (key === 'purchase_price' && value === 0);
        if (!isEmpty) updatePayload[key] = value;
      });
      if (Object.keys(updatePayload).length === 0) {
        importLogs.push({ id: targetId, status: "updated", identifier: obj.street_address || obj.name || `Row ${row.rowIndex}`, message: "No non-empty fields to update", details: obj });
        return;
      }
      const { data: rec, error } = await supabase.from(mode).update(updatePayload).eq('id', targetId).select('id').single();
      if (error) {
        importLogs.push({ id: targetId, status: "failed", identifier: obj.street_address || obj.name || `Row ${row.rowIndex}`, message: error.message, details: updatePayload });
      } else {
        await supabase.from("audit_logs").insert([{ company_id: companyId, user_id: userId, [mode === 'properties' ? 'property_id' : mode === 'entities' ? 'entity_id' : 'project_id']: rec.id, action: `bulk import updated existing record`, details: updatePayload }]);
        importLogs.push({ id: rec.id, status: "updated", identifier: obj.street_address || obj.name, details: updatePayload });
      }
    } else {
      const { data: rec, error } = await supabase.from(mode).insert(obj).select('id').single();
      if (error) {
        importLogs.push({ id: '', status: "failed", identifier: obj.street_address || obj.name || `Row ${row.rowIndex}`, message: error.message, details: obj });
      } else {
        await supabase.from("audit_logs").insert([{ company_id: companyId, user_id: userId, [mode === 'properties' ? 'property_id' : mode === 'entities' ? 'entity_id' : 'project_id']: rec.id, action: `bulk imported record`, details: obj }]);
        importLogs.push({ id: rec.id, status: "new", identifier: obj.street_address || obj.name, details: obj });
      }
    }
  };

  const commitChildRow = async (row: ParsedRow, section: ImportSection, importLogs: ImportRowResult[]) => {
    const refAddress = row.parsed.property_street_address;
    const refSuburb = row.parsed.property_suburb;

    let parentId: string | null = null;
    if (section.parentKey === 'property_id') {
      const res = await resolvePropertyParent(companyId!, refAddress, refSuburb);
      if (res.error || !res.id) {
        importLogs.push({ id: '', status: "failed", identifier: refAddress || `Row ${row.rowIndex}`, message: res.error || "Could not resolve or create parent property", details: row.parsed });
        return;
      }
      parentId = res.id;
    }

    const obj: any = { ...section.fixedValues };
    Object.entries(row.parsed).forEach(([key, val]) => {
      if (key === 'property_street_address' || key === 'property_suburb' || key === 'provider_entity_name' || key === 'provider_entity_type') return;
      obj[key] = val;
    });
    obj[section.parentKey] = parentId;

    if (row.parsed.provider_entity_name) {
      const providerId = await resolveProviderEntity(row.parsed, companyId!);
      if (section.targetTable === 'property_credentials') {
        obj.entity_id = providerId;
      } else {
        obj.provider_entity_id = providerId;
      }
    }

    const { data: rec, error } = await supabase.from(section.targetTable).insert(obj).select('id').single();
    if (error) {
      importLogs.push({ id: '', status: "failed", identifier: refAddress || `Row ${row.rowIndex}`, message: error.message, details: obj });
    } else {
      await supabase.from("audit_logs").insert([{
        company_id: companyId, user_id: userId, property_id: parentId,
        action: `bulk imported ${section.title.toLowerCase()}`, details: obj,
      }]);
      importLogs.push({ id: rec.id, status: "new", identifier: refAddress || `Row ${row.rowIndex}`, details: obj });
    }
  };

  const handleReverse = async (id: string, index: number) => {
    const section = currentSectionRef.current;
    if (!section) return;
    if (!window.confirm("Archive this entry? It will be soft-deleted, not permanently removed.")) return;
    const { error } = await supabase.from(section.targetTable).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (!error) {
      const next = [...results]; next[index].status = "reversed"; setResults(next); onRefresh();
    }
  };

  if (!isOpen) return null;

  const fields = parsedRows[0] ? Object.keys(parsedRows[0].parsed) : [];
  const flagsByRow = new Map<number, StagingFlag[]>();
  stagingFlags.forEach(f => flagsByRow.set(f.staging_row_index, [...(flagsByRow.get(f.staging_row_index) || []), f]));

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md font-sans antialiased text-slate-600">
      <div className="bg-white w-full max-w-7xl rounded-[40px] shadow-2xl flex flex-col max-h-[92vh]">

        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
          <div>
            <h2 className="text-xl font-light text-slate-900 uppercase tracking-widest leading-none">Data synchronization</h2>
            <p className="text-[11px] text-slate-400 mt-1 font-medium">
              {stage === 'upload' && 'Step 1 of 3 — choose a section and file'}
              {stage === 'checking' && 'Checking for duplicates and parent records...'}
              {stage === 'review' && 'Step 2 of 3 — review before committing'}
              {stage === 'committing' && 'Writing records...'}
              {stage === 'results' && 'Step 3 of 3 — import complete'}
            </p>
          </div>
          <button onClick={() => { onClose(); resetAll(); }} className="p-2 text-slate-300 hover:text-black transition-colors"><X size={20}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
          {stage === "upload" && (
            <>
              <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100">
                {(['projects', 'properties', 'entities'] as BaseMode[]).map((t) => (
                  <button key={t} onClick={() => setBaseMode(t)} className={`flex-1 py-3 rounded-xl text-xs font-medium capitalize transition-all ${baseMode === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>{t}</button>
                ))}
              </div>

              {loadingSections ? (
                <div className="flex items-center gap-2 text-slate-400 text-[12px] py-4"><Loader2 size={14} className="animate-spin" /> Loading sections...</div>
              ) : (
                <div className="p-6 bg-slate-50 border border-slate-100 rounded-[32px] space-y-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Which section are you importing?</p>
                  <div className="relative">
                    <select
                      value={sectionKey}
                      onChange={(e) => setSectionKey(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-full py-3 px-5 text-[13px] font-medium outline-none appearance-none cursor-pointer"
                    >
                      {sections.map(s => <option key={s.key} value={s.key}>{s.title}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  {!isBaseSection && (
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Include a <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200">property_street_address</code> column with the full address (street, suburb — same format as the property's own address) to link each row back to its property. Unmatched properties will be created automatically with minimal details.
                    </p>
                  )}
                  {currentSection && (
                    <button
                      onClick={() => {
                        const blob = new Blob([[!isBaseSection ? 'property_street_address,' : '', currentSection.headers.join(',')].join('')], { type: 'text/csv' });
                        const a = document.createElement('a');
                        a.href = window.URL.createObjectURL(blob);
                        a.download = `niksen_${currentSection.key}_template.csv`;
                        a.click();
                      }}
                      className="text-[11px] font-bold text-indigo-600 hover:underline"
                    >
                      Download template for this section
                    </button>
                  )}
                  <p className="text-[9px] text-slate-300">
                    Importing into: <span className="font-bold text-slate-400">{currentSection?.title || '—'}</span>
                  </p>
                </div>
              )}

              <FileUploader file={file} onFileSelect={setFile} fileInputRef={fileInputRef} />
              <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={(e) => { if (e.target.files) setFile(e.target.files[0]); }} />
            </>
          )}

          {stage === "checking" && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="animate-spin text-indigo-500" size={28} />
              <p className="text-[12px] font-medium text-slate-400">Parsing file and checking records...</p>
            </div>
          )}

          {stage === "review" && (
            <>
              {blockedRowsSetToInclude.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-[12px] font-medium text-amber-700 flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  {blockedRowsSetToInclude.length} row(s) flagged as likely duplicates are still set to create a new record.
                </div>
              )}

              <div className="flex items-center justify-between px-2">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{parsedRows.length} rows parsed</p>
                <div className="flex gap-4 text-[10px] font-bold uppercase">
                  {stagingFlags.length > 0 && <span className="text-amber-600">{stagingFlags.length} possible duplicates</span>}
                  {rowParentWarnings.size > 0 && <span className="text-blue-600">{rowParentWarnings.size} new parent records</span>}
                  <span className="text-slate-400">{Array.from(rowActions.values()).filter(a => a === 'skip').length} skipped</span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-[28px] overflow-auto max-h-[420px] custom-scrollbar">
                <table className="w-full text-left text-[12px] border-collapse min-w-max">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 sticky top-0">
                    <tr>
                      {isBaseSection && <th className="p-3 w-20">Action</th>}
                      <th className="p-3 font-bold uppercase text-[9px] tracking-widest">Row</th>
                      {fields.map(f => <th key={f} className="p-3 font-bold uppercase text-[9px] border-l border-slate-100 whitespace-nowrap">{f.replace(/_/g, ' ')}</th>)}
                      <th className="p-3 font-bold uppercase text-[9px] border-l border-slate-100">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map(row => {
                      const action = rowActions.get(row.rowIndex) || 'include';
                      const rowFlags = flagsByRow.get(row.rowIndex) || [];
                      const hasExistingMatch = rowUpdateTarget.has(row.rowIndex);
                      const parentWarning = rowParentWarnings.get(row.rowIndex);

                      return (
                        <tr key={row.rowIndex} className={`border-b border-slate-50 ${action === 'skip' ? 'opacity-40 bg-slate-50' : action === 'update' ? 'bg-blue-50/40' : rowFlags.length > 0 ? 'bg-amber-50/30' : ''}`}>
                          {isBaseSection && (
                            <td className="p-3 text-center">
                              <button
                                onClick={() => cycleRowAction(row.rowIndex)}
                                title={
                                  action === 'include' ? 'Click to skip this row' :
                                  action === 'skip' ? (hasExistingMatch ? 'Click to update the existing record instead' : 'Click to include as new') :
                                  'Click to include as new'
                                }
                                className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide transition-all w-full ${action === 'include' ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : action === 'skip' ? 'bg-slate-100 text-slate-400 hover:bg-slate-200' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                              >
                                {action === 'include' ? 'New' : action === 'skip' ? 'Skip' : 'Update'}
                              </button>
                            </td>
                          )}
                          <td className="p-3 font-bold text-slate-400">{row.rowIndex}</td>
                          {fields.map(field => {
                            const isEditing = editingCell?.row === row.rowIndex && editingCell?.field === field;
                            return (
                              <td key={field} className="p-1 border-l border-slate-50">
                                {isEditing ? (
                                  <input autoFocus defaultValue={row.parsed[field] ?? ''}
                                    onBlur={(e) => { handleEditCell(row.rowIndex, field, e.target.value); setEditingCell(null); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                    className="w-full p-2 border border-indigo-300 rounded-lg text-[12px] outline-none" />
                                ) : (
                                  <button onClick={() => setEditingCell({ row: row.rowIndex, field })} className="w-full text-left p-2 hover:bg-slate-50 rounded-lg">
                                    <span className={row.parsed[field] == null || row.parsed[field] === '' ? 'text-slate-300 italic' : 'text-slate-700 font-medium'}>
                                      {row.parsed[field] === null || row.parsed[field] === undefined || row.parsed[field] === '' ? 'empty' : String(row.parsed[field])}
                                    </span>
                                  </button>
                                )}
                              </td>
                            );
                          })}
                          <td className="p-3 border-l border-slate-50 max-w-[220px]">
                            {rowFlags.map((f, i) => (
                              <div key={i} className="flex items-start gap-1.5 text-amber-600 mb-1">
                                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                                <span className="text-[10px] font-medium leading-tight">{f.match_reason} {f.matched_against === 'existing' ? `(existing: ${f.matched_identifier})` : `(${f.matched_identifier})`}</span>
                              </div>
                            ))}
                            {parentWarning && (
                              <div className="flex items-start gap-1.5 text-blue-600">
                                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                                <span className="text-[10px] font-medium leading-tight">{parentWarning}</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {stage === "committing" && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="animate-spin text-indigo-500" size={28} />
              <p className="text-[12px] font-medium text-slate-400">Writing records...</p>
            </div>
          )}

          {stage === "results" && <ImportResultsTable results={results} onReverse={handleReverse} />}
        </div>

        <div className="p-6 bg-white border-t border-slate-50 flex justify-between items-center">
          {stage === "review" ? (
            <button onClick={() => { if (batchId) clearStaging(batchId); setStage("upload"); }} className="flex items-center gap-2 px-6 py-3 text-slate-400 hover:text-slate-700 text-sm font-medium transition-all">
              <ArrowLeft size={16} /> Back
            </button>
          ) : <div />}

          {stage === "upload" && (
            <button disabled={!file} onClick={handleAnalyze} className="px-8 py-4 bg-slate-900 text-white rounded-full text-sm font-medium transition-all hover:bg-black disabled:opacity-30 flex items-center gap-2">
              Analyze file <ArrowRight size={16} />
            </button>
          )}
          {stage === "review" && (
            <button onClick={handleCommit} className="px-8 py-4 bg-slate-900 text-white rounded-full text-sm font-medium transition-all hover:bg-black flex items-center gap-2">
              Commit {Array.from(rowActions.values()).filter(a => a !== 'skip').length} records <ArrowRight size={16} />
            </button>
          )}
          {stage === "results" && (
            <button onClick={resetAll} className="px-8 py-4 bg-slate-50 border border-slate-200 text-slate-600 rounded-full text-sm font-medium hover:bg-slate-100 transition-all">
              Import another file
            </button>
          )}
        </div>
      </div>
    </div>
  );
}