// supabase/functions/gmail-addon/index.ts
// Handles all Gmail Add-on API calls

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const googleClientId     = Deno.env.get('GOOGLE_CLIENT_ID')!;
const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

const db = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/gmail-addon/, '');
  const userEmail = req.headers.get('X-User-Email') || '';

  console.log(`[gmail-addon] ${req.method} ${path} user=${userEmail}`);

  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    // ── GET /user-context ──────────────────────────────────────────
    if (req.method === 'GET' && path === '/user-context') {
      if (!userEmail) return json({ error: 'No user email' }, 401, headers);

      // Find profile by email
      const { data: profile } = await db
        .from('profiles')
        .select('id, full_name, active_company_id')
        .eq('email', userEmail)
        .single();

      if (!profile) return json({ error: 'User not found. Connect Gmail in the Flow app first.' }, 404, headers);

      // Get all companies this user belongs to
      const { data: memberships } = await db
        .from('company_memberships')
        .select('company_id, role, companies:company_id(id, name)')
        .eq('user_id', profile.id);

      const companies = (memberships || []).map((m: any) => ({
        id: m.company_id,
        name: m.companies?.name || m.company_id,
        role: m.role,
      }));

      const activeCompany = companies.find(c => c.id === profile.active_company_id) || companies[0];

      return json({
        email: userEmail,
        companies,
        activeCompanyId: activeCompany?.id || null,
        activeCompanyName: activeCompany?.name || null,
      }, 200, headers);
    }

    // ── POST /switch-company ───────────────────────────────────────
    if (req.method === 'POST' && path === '/switch-company') {
      const body = await req.json();
      const { companyId } = body;
      if (!userEmail || !companyId) return json({ error: 'Missing params' }, 400, headers);

      const { data: profile } = await db
        .from('profiles').select('id').eq('email', userEmail).single();
      if (!profile) return json({ error: 'User not found' }, 404, headers);

      await db.from('profiles').update({ active_company_id: companyId }).eq('id', profile.id);

      const { data: company } = await db
        .from('companies').select('name').eq('id', companyId).single();

      return json({ ok: true, companyName: company?.name }, 200, headers);
    }

    // ── GET /label-settings ────────────────────────────────────────
    if (req.method === 'GET' && path === '/label-settings') {
      const companyId = url.searchParams.get('companyId') || '';
      if (!companyId) return json({ error: 'Missing companyId' }, 400, headers);

      const { data: company } = await db
        .from('companies')
        .select('gmail_label_format, gmail_parent_label, gmail_parent_code, gmail_sublabel_separator, gmail_label_tokens, gmail_source_emails')
        .eq('id', companyId)
        .single();

      if (!company) return json({ error: 'Company not found' }, 404, headers);

      const { data: profile } = await db
        .from('profiles').select('id').eq('email', userEmail).single();
      const { data: mem } = await db
        .from('company_memberships').select('role').eq('user_id', profile?.id).eq('company_id', companyId).single();

      return json({
        parentLabel: company.gmail_parent_label || 'Shared Emails',
        parentCode: company.gmail_parent_code || '',
        separator: company.gmail_sublabel_separator || ' — ',
        tokens: company.gmail_label_tokens || ['project_name'],
        isAdmin: mem?.role === 'company_admin',
      }, 200, headers);
    }

    // ── GET /check-message ─────────────────────────────────────────
    if (req.method === 'GET' && path === '/check-message') {
      const messageId = url.searchParams.get('messageId') || '';
      const companyId = url.searchParams.get('companyId') || '';

      const { data } = await db
        .from('project_emails')
        .select('project_id, projects:project_id(id, name), project_gmail_labels!inner(gmail_label_name)')
        .eq('gmail_message_id', messageId)
        .eq('company_id', companyId)
        .limit(1)
        .single();

      if (!data) return json({}, 200, headers);

      return json({
        projectId: data.project_id,
        projectName: (data.projects as any)?.name || '',
        labelName: (data.project_gmail_labels as any)?.[0]?.gmail_label_name || '',
      }, 200, headers);
    }

    // ── GET /search-projects ───────────────────────────────────────
    if (req.method === 'GET' && path === '/search-projects') {
      const companyId = url.searchParams.get('companyId') || '';
      const labelled = url.searchParams.get('labelled');
      const q = url.searchParams.get('q') || '';
      const status = url.searchParams.get('status') || '';

      let query = db
        .from('projects')
        .select('id, name, status, project_gmail_labels(id, gmail_label_name)')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('name');

      if (q) query = query.ilike('name', `%${q}%`);
      if (status) query = query.eq('status', status);

      const { data: projects } = await query;
      let filtered = projects || [];

      if (labelled === 'true') {
        filtered = filtered.filter((p: any) =>
          p.project_gmail_labels && p.project_gmail_labels.length > 0
        );
      } else if (labelled === 'false') {
        filtered = filtered.filter((p: any) =>
          !p.project_gmail_labels || p.project_gmail_labels.length === 0
        );
      }

      // Get addon display fields config for this company
      const { data: addonConfig } = await db
        .from('company_addon_config')
        .select('display_fields')
        .eq('company_id', companyId)
        .single();

      const displayFields: string[] = addonConfig?.display_fields || [];

      // Fetch custom field values for display fields
      let customValues: Record<string, Record<string, string>> = {};
      if (displayFields.length > 0 && filtered.length > 0) {
        const projectIds = filtered.map((p: any) => p.id);
        // Get custom field definitions
        const { data: cfDefs } = await db
          .from('company_custom_fields')
          .select('id, label, field_key')
          .eq('company_id', companyId)
          .eq('table_name', 'projects')
          .in('field_key', displayFields);

        if (cfDefs?.length) {
          const { data: cfVals } = await db
            .from('company_custom_field_values')
            .select('record_id, field_id, value_text, value_number')
            .in('record_id', projectIds)
            .in('field_id', cfDefs.map((f: any) => f.id));

          const fieldMap: Record<string, string> = {};
          cfDefs.forEach((f: any) => { fieldMap[f.id] = f.label; });

          (cfVals || []).forEach((v: any) => {
            if (!customValues[v.record_id]) customValues[v.record_id] = {};
            const label = fieldMap[v.field_id] || v.field_id;
            customValues[v.record_id][label] = v.value_text || String(v.value_number || '');
          });
        }
      }

      return json({
        projects: filtered.map((p: any) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          labelName: p.project_gmail_labels?.[0]?.gmail_label_name || null,
          customFields: customValues[p.id] || {},
        })),
        displayFields,
      }, 200, headers);
    }

    // ── GET /addon-config ─────────────────────────────────────────
    if (req.method === 'GET' && path === '/addon-config') {
      const companyId = url.searchParams.get('companyId') || '';

      const { data: config } = await db
        .from('company_addon_config')
        .select('display_fields')
        .eq('company_id', companyId)
        .single();

      // Get available custom fields for projects
      const { data: fields } = await db
        .from('company_custom_fields')
        .select('id, label, field_key, field_type')
        .eq('company_id', companyId)
        .eq('table_name', 'projects')
        .order('display_order');

      return json({
        displayFields: config?.display_fields || [],
        availableFields: (fields || []).map((f: any) => ({
          key: f.field_key,
          label: f.label,
          type: f.field_type,
        })),
      }, 200, headers);
    }

    // ── POST /addon-config ────────────────────────────────────────
    if (req.method === 'POST' && path === '/addon-config') {
      const body = await req.json();
      const { companyId, displayFields } = body;
      if (!companyId) return json({ error: 'Missing companyId' }, 400, headers);

      await db.from('company_addon_config').upsert({
        company_id: companyId,
        display_fields: (displayFields || []).slice(0, 2), // max 2
        updated_at: new Date().toISOString(),
      }, { onConflict: 'company_id' });

      return json({ ok: true }, 200, headers);
    }

    // ── POST /create-project ───────────────────────────────────────
    if (req.method === 'POST' && path === '/create-project') {
      const body = await req.json();
      const { projectName, matterNumber, status, messageId, companyId } = body;

      if (!projectName || !companyId) return json({ error: 'Missing required fields' }, 400, headers);

      const { data: profile } = await db
        .from('profiles').select('id').eq('email', userEmail).single();
      if (!profile) return json({ error: 'User not found' }, 404, headers);

      // Get label settings
      const { data: company } = await db
        .from('companies')
        .select('gmail_parent_label, gmail_parent_code, gmail_sublabel_separator, gmail_label_tokens')
        .eq('id', companyId).single();

      // Build label name
      const tokens: string[] = company?.gmail_label_tokens || ['project_name'];
      const separator = company?.gmail_sublabel_separator || ' — ';
      const parentLabel = company?.gmail_parent_label || 'Shared Emails';
      const labelCode = generateLabelCode();

      const parts = tokens.map((t: string) => {
        if (t === 'project_name') return projectName;
        if (t === 'matter_number') return matterNumber || '';
        if (t === 'year') return new Date().getFullYear().toString();
        return t;
      }).filter(Boolean);

      const sublabel = parts.join(separator) + ` [${labelCode}]`;
      const fullLabelName = `${parentLabel}/${sublabel}`;

      // Create project in DB
      const { data: project, error: projErr } = await db
        .from('projects')
        .insert({
          company_id: companyId,
          name: projectName,
          status: status || 'active',
          created_by: profile.id,
        })
        .select('id').single();

      if (projErr || !project) {
        return json({ error: projErr?.message || 'Failed to create project' }, 500, headers);
      }

      // Create custom field values for matter number
      if (matterNumber) {
        const { data: matterField } = await db
          .from('company_custom_fields')
          .select('id')
          .eq('company_id', companyId)
          .eq('table_name', 'projects')
          .ilike('label', '%matter%number%')
          .single();

        if (matterField) {
          await db.from('company_custom_field_values').insert({
            company_id: companyId,
            field_id: matterField.id,
            record_id: project.id,
            table_name: 'projects',
            value_text: matterNumber,
          });
        }
      }

      // Create Gmail label in DB
      await db.from('project_gmail_labels').insert({
        company_id: companyId,
        project_id: project.id,
        gmail_label_name: fullLabelName,
        label_sub: sublabel,
        label_code: labelCode,
        created_by: profile.id,
      });

      // Save message to project_emails if messageId provided
      if (messageId) {
        await db.from('project_emails').upsert({
          company_id: companyId,
          user_id: profile.id,
          project_id: project.id,
          gmail_message_id: messageId,
          gmail_thread_id: messageId,
          gmail_label_applied: true,
        }, { onConflict: 'company_id,user_id,gmail_message_id', ignoreDuplicates: true });
      }

      return json({ ok: true, projectId: project.id, labelName: fullLabelName, labelCode }, 200, headers);
    }

    // ── POST /import-label ─────────────────────────────────────────
    if (req.method === 'POST' && path === '/import-label') {
      const body = await req.json();
      const { projectId, companyId } = body;

      // Check if label already exists
      const { data: existing } = await db
        .from('project_gmail_labels')
        .select('id, gmail_label_name')
        .eq('project_id', projectId)
        .is('removed_at', null)
        .single();

      if (existing) {
        return json({ ok: true, labelName: existing.gmail_label_name, existed: true }, 200, headers);
      }

      // Get project details
      const { data: project } = await db
        .from('projects').select('name').eq('id', projectId).single();
      if (!project) return json({ error: 'Project not found' }, 404, headers);

      // Get company label settings
      const { data: company } = await db
        .from('companies')
        .select('gmail_parent_label, gmail_sublabel_separator, gmail_label_tokens')
        .eq('id', companyId).single();

      const tokens: string[] = company?.gmail_label_tokens || ['project_name'];
      const separator = company?.gmail_sublabel_separator || ' — ';
      const parentLabel = company?.gmail_parent_label || 'Shared Emails';
      const labelCode = generateLabelCode();

      // Get matter number if exists
      let matterNumber = '';
      const { data: matterField } = await db
        .from('company_custom_fields')
        .select('id')
        .eq('company_id', companyId)
        .eq('table_name', 'projects')
        .ilike('label', '%matter%number%')
        .single();

      if (matterField) {
        const { data: matterVal } = await db
          .from('company_custom_field_values')
          .select('value_text')
          .eq('field_id', matterField.id)
          .eq('record_id', projectId)
          .single();
        matterNumber = matterVal?.value_text || '';
      }

      const parts = tokens.map((t: string) => {
        if (t === 'project_name') return project.name;
        if (t === 'matter_number') return matterNumber || '';
        if (t === 'year') return new Date().getFullYear().toString();
        return t;
      }).filter(Boolean);

      const sublabel = parts.join(separator) + ` [${labelCode}]`;
      const fullLabelName = `${parentLabel}/${sublabel}`;

      const { data: profile } = await db
        .from('profiles').select('id').eq('email', userEmail).single();

      await db.from('project_gmail_labels').insert({
        company_id: companyId,
        project_id: projectId,
        gmail_label_name: fullLabelName,
        label_sub: sublabel,
        label_code: labelCode,
        created_by: profile?.id,
      });

      return json({ ok: true, labelName: fullLabelName }, 200, headers);
    }

    // ── POST /remove-project ───────────────────────────────────────
    if (req.method === 'POST' && path === '/remove-project') {
      const body = await req.json();
      const { projectId } = body;

      // Soft delete project
      await db.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', projectId);

      // Mark labels as removed
      await db.from('project_gmail_labels')
        .update({ removed_at: new Date().toISOString() })
        .eq('project_id', projectId);

      return json({ ok: true }, 200, headers);
    }

    // ── POST /remove-label ─────────────────────────────────────────
    if (req.method === 'POST' && path === '/remove-label') {
      const body = await req.json();
      const { messageId } = body;

      await db.from('project_emails')
        .delete()
        .eq('gmail_message_id', messageId);

      return json({ ok: true, removedFromUsers: 1 }, 200, headers);
    }

    return json({ error: 'Not found' }, 404, headers);

  } catch (err: any) {
    console.error('[gmail-addon] Error:', err?.message);
    return json({ error: err?.message || 'Internal error' }, 500, headers);
  }
});

function json(data: any, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function generateLabelCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}