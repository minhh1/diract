// components/virtualcomputers/CostComparisonTable.tsx
"use client";

import type { CloudProviderId, VmSizeOption } from "@/lib/vmProviders/types";

interface Props {
  pricing: Record<CloudProviderId, VmSizeOption[]>;
  providerLabels: Record<CloudProviderId, string>;
  provisionableProviders: CloudProviderId[];
}

export default function CostComparisonTable({ pricing, providerLabels, provisionableProviders }: Props) {
  const providers = Object.keys(pricing) as CloudProviderId[];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            <th className="pb-2 pr-4">Provider</th>
            <th className="pb-2 pr-4">Size</th>
            <th className="pb-2 pr-4">Slug</th>
            <th className="pb-2">Est. cost</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((provider) =>
            pricing[provider].map((size, i) => (
              <tr key={`${provider}-${size.slug}`} className="border-t border-slate-100">
                <td className="py-2 pr-4 font-medium text-slate-700 whitespace-nowrap">
                  {i === 0 && providerLabels[provider]}
                  {i === 0 && !provisionableProviders.includes(provider) && (
                    <span className="ml-2 text-[9px] font-bold text-amber-500 uppercase tracking-wide">Coming soon</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-slate-600 whitespace-nowrap">{size.label}</td>
                <td className="py-2 pr-4 text-slate-400 whitespace-nowrap">{size.slug}</td>
                <td className="py-2 text-slate-700 whitespace-nowrap">
                  ${size.hourlyUsd.toFixed(3)}/hr (~${(size.hourlyUsd * 730).toFixed(0)}/mo)
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
