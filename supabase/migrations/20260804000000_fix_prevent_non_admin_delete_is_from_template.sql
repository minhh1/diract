-- prevent_non_admin_delete() is a shared trigger attached to 8 tables
-- (projects, tasks, properties, entities, company_custom_fields,
-- company_tables, company_table_fields, company_table_records), but its
-- template-lock check unconditionally referenced OLD.is_from_template --
-- a column that only exists on company_tables/company_table_fields/
-- company_custom_fields, not the other 5. OLD/NEW in a shared trigger
-- function are the generic `RECORD` pseudo-type, resolved dynamically per
-- invocation, so referencing a field that doesn't exist on the row being
-- updated raises `record "old" has no field "is_from_template"` --
-- confirmed live: toggling a task complete on the Public Tasks page
-- (a plain UPDATE on `tasks`) failed with exactly this error, and the same
-- crash would hit ANY update/delete on projects/properties/entities/
-- company_table_records too, not just tasks.
--
-- The original `IF a AND b AND c THEN` relied on short-circuit evaluation
-- to skip `OLD.is_from_template` when `TG_TABLE_NAME` didn't match --
-- but PL/pgSQL still has to resolve/plan that field access as part of
-- building the boolean expression for a dynamically-typed RECORD, so it
-- fails before evaluation-order short-circuiting can save it. Fixed by
-- nesting: the outer IF only tests TG_TABLE_NAME (a plain text variable,
-- no RECORD field access at all), and the inner block referencing
-- OLD.is_from_template is only ever reached -- and so only ever
-- parsed/executed -- for the 3 tables that actually have that column.
CREATE OR REPLACE FUNCTION public.prevent_non_admin_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME IN ('company_tables', 'company_table_fields', 'company_custom_fields') THEN
    IF COALESCE(OLD.is_from_template, false)
       AND current_setting('app.bypass_template_lock', true) IS DISTINCT FROM 'on'
    THEN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'This was installed from a template and can never be deleted.' USING ERRCODE = '42501';
      ELSIF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
        RAISE EXCEPTION 'This was installed from a template and can never be archived or deleted.' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF auth.role() = 'service_role' OR is_current_user_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Only a company admin can permanently delete this record.' USING ERRCODE = '42501';
  END IF;

  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'Only a company admin can archive this record directly. Submit an archive request instead.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;
