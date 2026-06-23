"use client";

import { useState, useRef } from "react";
import { X, Upload, Download, Loader2, CheckCircle2, FileUp, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";

// Modular Sub-components
import TemplateDownload from "./import/TemplateDownload";
import FileUploader from "./import/FileUploader";
import ImportResultsTable from "./import/ImportResultsTable";

interface ImportRowResult {
  id: string;
  status: "new" | "updated" | "failed" | "reversed";
  identifier: string;
  message?: string;
  details?: any;
}

export default function ImportModal({ isOpen, onClose, onRefresh }: any) {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"projects" | "properties" | "entities">("properties");
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<ImportRowResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 1. FIRST-IDENTIFIER ADDRESS PARSER ---
  const parseAUAddress = (fullStr: string) => {
    const res = { street_address: fullStr, suburb: "", state: "NSW", postcode: "" };
    if (!fullStr) return res;

    // List of identifiers to split on
    const ids = ["Street", "St", "Drive", "Dr", "Road", "Rd", "Avenue", "Ave", "Crescent", "Cres", "Parade", "Pde", "Close", "Cl", "Place", "Pl", "Court", "Ct", "Lane", "Ln"];
    
    try {
      // Standardize spacing and remove commas for parsing
      const clean = fullStr.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
      const words = clean.split(' ');
      
      // LOGIC: Find the FIRST occurrence of a street identifier
      let splitIdx = -1;
      for (let i = 0; i < words.length; i++) {
        if (ids.some(id => id.toLowerCase() === words[i].toLowerCase())) {
          splitIdx = i;
          break; // Stop at the first match
        }
      }

      if (splitIdx !== -1) {
        // Street Address is everything up to the first identifier
        res.street_address = words.slice(0, splitIdx + 1).join(' ');
        const remainder = words.slice(splitIdx + 1);

        // Parse remainder (Suburb, State, Postcode) from right to left
        if (remainder.length > 0 && /^\d{4}$/.test(remainder[remainder.length - 1])) {
          res.postcode = remainder.pop() || "";
        }
        if (remainder.length > 0 && remainder[remainder.length - 1].length <= 3) {
          res.state = remainder.pop()?.toUpperCase() || "NSW";
        }
        
        // Everything left in the middle is the Suburb (handles "Crescent Head")
        res.suburb = remainder.join(' ');
      }
    } catch (e) {
      console.error("Address parse logic failed");
    }
    return res;
  };

  // --- 2. POSITIONAL CSV SPLITTER ---
  const splitCSVLine = (text: string) => {
    const result = [];
    let cur = "";
    let inQuotes = false;
    for (let char of text) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = "";
      } else cur += char;
    }
    result.push(cur.trim());
    return result;
  };

  // --- 3. MAIN IMPORT ENGINE ---
  const processImport = async () => {
    if (!file) return;
    setLoading(true);
    const importLogs: ImportRowResult[] = [];
    const batchId = crypto.randomUUID();

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const rows = text.replace(/\r/g, "").split("\n").filter(r => r.trim());
        const headers = rows[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));

        const { data: { user } } = await supabase.auth.getUser();
        const { data: prof } = await supabase.from("profiles").select("company_id").eq("id", user?.id).single();
        const compId = prof?.company_id;

        for (const row of rows.slice(1)) {
          const values = splitCSVLine(row);
          let obj: any = { company_id: compId, import_id: batchId };
          let eName = ""; let eType = "";

          // STRICT POSITIONAL MAPPING: Prevents Price/Date shifting
          headers.forEach((header, i) => {
            const val = values[i] || "";
            
            if (header === 'full_address' && mode === 'properties') {
              Object.assign(obj, parseAUAddress(val));
            } else if (header === 'entity_name') { eName = val; }
            else if (header === 'entity_type') { eType = val; }
            else if (header === 'purchase_price') {
              // Clean number: "$1,200,000" -> 1200000
              obj[header] = parseFloat(val.replace(/[$,\s]/g, "")) || 0;
            } else if (header.includes('date') || header.includes('expiry')) {
              // Standardize date for Postgres
              const d = new Date(val);
              obj[header] = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : null;
            } else {
              obj[header] = val || null;
            }
          });

          // Relation: Create/Link Entity for Properties
          if (mode === 'properties' && eName) {
            const { data: ent } = await supabase.from("entities")
              .upsert({ name: eName, entity_type: eType || 'Company', company_id: compId }, { onConflict: 'company_id,name' })
              .select('id').single();
            if (ent) obj.holding_entity_id = ent.id;
          }

          const conflict = mode === 'properties' ? 'company_id,street_address,suburb' : 'company_id,name';
          const { data: rec, error, status } = await supabase.from(mode).upsert(obj, { onConflict: conflict }).select('id').single();

          if (error) {
            importLogs.push({ id: '', status: "failed", identifier: obj.street_address || obj.name || "Row", message: error.message, details: obj });
          } else {
            // Log the detail for Audit Log view
            await supabase.from("audit_logs").insert([{
              company_id: compId, user_id: user?.id,
              [mode === 'properties' ? 'property_id' : 'entity_id']: rec.id,
              action: `bulk imported record`,
              details: obj
            }]);
            importLogs.push({ id: rec.id, status: status === 201 ? "new" : "updated", identifier: obj.street_address || obj.name, details: obj });
          }
        }

        // Save Summary to Import History
        await supabase.from("import_history").insert([{
          id: batchId, user_id: user?.id, company_id: compId, target_table: mode,
          filename: file.name, results_json: importLogs
        }]);

        setResults(importLogs);
        onRefresh();
      } catch (err: any) { alert(`System error: ${err.message}`); }
      setLoading(false);
    };
    reader.readAsText(file);
  };

  const handleReverse = async (id: string, index: number) => {
    if (!window.confirm("Archive this entry?")) return;
    const { error } = await supabase.from(mode).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (!error) {
      const next = [...results];
      next[index].status = "reversed";
      setResults(next);
      onRefresh();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md font-sans antialiased text-slate-600">
      <div className="bg-white w-full max-w-6xl rounded-[40px] shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* HEADER */}
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
          <div>
            <h2 className="text-xl font-light text-slate-900 uppercase tracking-widest leading-none">Data synchronization</h2>
            <p className="text-[11px] text-slate-400 mt-1 font-medium">Reconcile external CSV records with ERP</p>
          </div>
          <button onClick={() => { onClose(); setResults([]); setFile(null); }} className="p-2 text-slate-300 hover:text-black transition-colors"><X size={20}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
          {results.length === 0 ? (
            <>
              <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100">
                {['projects', 'properties', 'entities'].map((t: any) => (
                  <button key={t} onClick={() => setMode(t)} className={`flex-1 py-3 rounded-xl text-xs font-medium capitalize transition-all ${mode === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>{t}</button>
                ))}
              </div>
              <TemplateDownload mode={mode} />
              <FileUploader file={file} onFileSelect={setFile} fileInputRef={fileInputRef} />
              <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={(e) => { if (e.target.files) setFile(e.target.files[0]); }} />
            </>
          ) : (
            <ImportResultsTable results={results} onReverse={handleReverse} />
          )}
        </div>

        {results.length === 0 && (
          <div className="p-6 bg-white border-t border-slate-50">
            <button disabled={loading || !file} onClick={processImport} className="w-full py-4 bg-slate-900 text-white rounded-full text-sm font-medium transition-all hover:bg-black disabled:opacity-30">
              {loading ? <Loader2 className="animate-spin mx-auto" size={16} /> : "Initiate synchronization"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}