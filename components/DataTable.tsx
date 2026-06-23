"use client";

import React from "react";

interface DataTableProps {
  children: React.ReactNode;
  minWidth?: number;
}

export default function DataTable({ children, minWidth = 1200 }: DataTableProps) {
  return (
    <div className="flex-1 overflow-auto custom-scrollbar bg-[#F9FAFB] p-8">
      <div 
        className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden inline-block min-w-full"
        style={{ minWidth: `${minWidth}px` }}
      >
        <table className="w-full table-fixed border-collapse text-left text-[13px]">
          {children}
        </table>
      </div>
    </div>
  );
}