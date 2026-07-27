-- Company-wide timezone, used to base every date/time computation the AI
-- assistant does on the company's actual local time instead of a hardcoded
-- guess -- "today"/weekday resolution for relative dates ("tomorrow"),
-- confirmation-summary weekday display, and the actual wall-clock time an
-- AI-booked appointment lands on when synced to the firm's shared Google
-- Calendar (see lib/companyTimezone.ts, lib/ai/calendarBooking.ts,
-- lib/ai/appointmentAction.ts, lib/ai/actionAdvance.ts,
-- lib/botEngine/handleMessage.ts, and supabase/functions/calendar-sync,
-- all of which previously either hardcoded "Australia/Sydney" or used UTC
-- as a stand-in for "the company's local day"). Defaults to UTC (not
-- Australia/Sydney) so an existing company that hasn't set one doesn't
-- silently start behaving as if it's in a different country -- same
-- reasoning as company_vm_schedules.timezone's default.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

UPDATE companies SET timezone = 'Australia/Sydney' WHERE name = 'Huynh Lawyers';
