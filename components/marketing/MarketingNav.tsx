import Link from "next/link";
import BrandMark from "./BrandMark";

export default function MarketingNav({ audienceLinks }: { audienceLinks?: { href: string; label: string }[] }) {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <BrandMark size={28} />
          <span className="font-medium text-slate-900 tracking-tight">Diract</span>
        </Link>
        <div className="flex items-center gap-7">
          {audienceLinks?.map((link) => (
            <Link key={link.href} href={link.href} className="text-[13px] text-slate-500 hover:text-indigo-600 transition-colors font-medium hidden md:inline">
              {link.label}
            </Link>
          ))}
          <Link href="/privacy" className="text-[12px] text-slate-400 hover:text-slate-700 transition-colors hidden sm:inline">Privacy</Link>
          <Link href="/terms" className="text-[12px] text-slate-400 hover:text-slate-700 transition-colors hidden sm:inline">Terms</Link>
          <Link href="/login" className="px-4 py-2 bg-indigo-600 text-white text-[12px] font-medium rounded-full hover:bg-indigo-700 transition-colors">
            Sign in
          </Link>
        </div>
      </div>
    </nav>
  );
}
