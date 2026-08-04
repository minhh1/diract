SET request.jwt.claim.role = 'service_role';

-- Niksen Time Pty Ltd is a property developer -- gates the "Quick Glance"
-- landing dashboard's property-developer widget set (see
-- components/dashboard/QuickGlanceDashboard.tsx), same company_type
-- mechanism supabase/companies_company_type.sql already introduced for
-- Huynh Lawyers/'Law Firm'.
UPDATE companies SET company_type = 'Property Developer'
WHERE id = '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
