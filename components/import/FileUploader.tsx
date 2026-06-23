"use client";
import { FileUp, CheckCircle2 } from "lucide-react";

export default function FileUploader({ file, onFileSelect, fileInputRef }: any) {
  return (
    <div 
      onClick={() => fileInputRef.current?.click()}
      className={`group cursor-pointer py-20 border-2 border-dashed rounded-[40px] flex flex-col items-center justify-center transition-all ${
        file ? 'border-indigo-600 bg-indigo-50/30' : 'border-slate-100 hover:border-slate-300'
      }`}
    >
      <div className={`h-16 w-16 rounded-3xl flex items-center justify-center mb-4 transition-all ${
        file ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-50 text-slate-300'
      }`}>
        {file ? <CheckCircle2 size={32}/> : <FileUp size={32}/>}
      </div>
      <p className="text-sm font-medium text-slate-600">
        {file ? file.name : "Select CSV file to sync"}
      </p>
      <p className="text-[10px] text-slate-400 uppercase mt-2 font-bold tracking-widest">
        CSV files only
      </p>
    </div>
  );
}