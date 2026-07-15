// supabase/functions/date-calc/index.ts
// "X days from" calculator — calendar days or Australian business days
// (business days skip weekends + public holidays for a chosen state).
//
// Called with: { fromDate: 'YYYY-MM-DD', days: number, mode: 'calendar' | 'business', state?: string }
// state is an AU state/territory code: NSW | VIC | QLD | WA | SA | TAS | ACT | NT
// Returns: { resultDate: 'YYYY-MM-DD', dayOfWeek, mode, state, holidaysSkipped, weekendsSkipped }

const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface NagerHoliday {
  date: string;
  localName: string;
  name: string;
  counties: string[] | null;
}

// In-memory cache — persists across warm invocations of this edge function instance.
const holidayCache = new Map<number, NagerHoliday[]>();

async function getHolidaysForYear(year: number): Promise<NagerHoliday[]> {
  if (holidayCache.has(year)) return holidayCache.get(year)!;
  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/AU`);
    if (!res.ok) {
      holidayCache.set(year, []);
      return [];
    }
    const data: NagerHoliday[] = await res.json();
    holidayCache.set(year, data);
    return data;
  } catch {
    return [];
  }
}

function isHolidayForState(holiday: NagerHoliday, state: string): boolean {
  if (!holiday.counties) return true; // national holiday — applies to every state
  return holiday.counties.includes(`AU-${state}`);
}

function toDateOnly(d: Date): string {
  return d.toISOString().substring(0, 10);
}

function addDaysUTC(d: Date, n: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + n);
  return next;
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const fromDateStr: string = (body.fromDate || '').substring(0, 10);
    const days: number = Number(body.days);
    const mode: string = body.mode === 'business' ? 'business' : 'calendar';
    const state: string | null = body.state ? String(body.state).toUpperCase() : null;

    if (!fromDateStr || isNaN(Date.parse(fromDateStr))) {
      return new Response(JSON.stringify({ error: 'Missing or invalid fromDate (expected YYYY-MM-DD)' }), { status: 400, headers: corsHeaders });
    }
    if (!Number.isFinite(days)) {
      return new Response(JSON.stringify({ error: 'Missing or invalid days' }), { status: 400, headers: corsHeaders });
    }
    if (mode === 'business' && (!state || !AU_STATES.includes(state))) {
      return new Response(JSON.stringify({ error: `Business mode requires a valid AU state: ${AU_STATES.join(', ')}` }), { status: 400, headers: corsHeaders });
    }

    const from = new Date(`${fromDateStr}T00:00:00Z`);

    if (mode === 'calendar') {
      const result = addDaysUTC(from, days);
      return new Response(JSON.stringify({
        resultDate: toDateOnly(result),
        dayOfWeek: DAY_NAMES[result.getUTCDay()],
        mode, state: null,
        holidaysSkipped: [], weekendsSkipped: 0,
      }), { headers: corsHeaders });
    }

    // ── Business day mode ──────────────────────────────────────────
    const step = days >= 0 ? 1 : -1;
    const target = Math.abs(days);

    // Pre-fetch holidays for every year we might touch — rough upper bound of
    // 3 calendar days per business day covers weekends/holiday clusters.
    const yearsNeeded = new Set<number>();
    const roughSpanDays = target * 3 + 10;
    for (let i = -roughSpanDays; i <= roughSpanDays; i += 30) {
      yearsNeeded.add(addDaysUTC(from, i).getUTCFullYear());
    }
    const holidaysByYear = new Map<number, NagerHoliday[]>();
    for (const y of yearsNeeded) holidaysByYear.set(y, await getHolidaysForYear(y));

    const isHoliday = (d: Date): { skip: boolean; name?: string } => {
      const year = d.getUTCFullYear();
      const dateStr = toDateOnly(d);
      const holidays = holidaysByYear.get(year) || [];
      const match = holidays.find(h => h.date === dateStr && isHolidayForState(h, state!));
      return match ? { skip: true, name: match.localName } : { skip: false };
    };

    let cursor = from;
    let counted = 0;
    const holidaysSkipped: { date: string; name: string }[] = [];
    let weekendsSkipped = 0;

    while (counted < target) {
      cursor = addDaysUTC(cursor, step);
      const dow = cursor.getUTCDay();
      if (dow === 0 || dow === 6) { weekendsSkipped++; continue; }
      const h = isHoliday(cursor);
      if (h.skip) { holidaysSkipped.push({ date: toDateOnly(cursor), name: h.name! }); continue; }
      counted++;
    }

    return new Response(JSON.stringify({
      resultDate: toDateOnly(cursor),
      dayOfWeek: DAY_NAMES[cursor.getUTCDay()],
      mode, state,
      holidaysSkipped, weekendsSkipped,
    }), { headers: corsHeaders });

  } catch (err: any) {
    console.error('[date-calc] error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
