import Link from "next/link";
import BrandMark from "./BrandMark";

export default function MarketingFooter() {
  return (
    <footer className="border-t border-slate-100 py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <BrandMark size={20} />
          <span className="text-sm text-slate-500">Diract</span>
        </div>
        <div className="flex items-center gap-6 text-[12px] text-slate-400">
          <Link href="/privacy" className="hover:text-slate-700 transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-slate-700 transition-colors">Terms of Service</Link>
          <span>© {new Date().getFullYear()} Diract</span>
        </div>
      </div>
    </footer>
  );
}
