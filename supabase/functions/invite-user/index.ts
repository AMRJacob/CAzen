// Invite somebody to the firm by email and put them on projects.
//
// Only a firm owner or admin may call this. The caller's own token is used to check that; the
// service key is used only after the check passes, for the two things a browser cannot do:
// send the invitation, and add the firm and project memberships for someone who is not the caller.
//
// Deployed to production 2026-11-19 (version 1). This file is the source of record.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const auth = req.headers.get('Authorization') ?? ''
    const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: who } = await asCaller.auth.getUser()
    if (!who?.user) return json({ error: 'Sign in first.' }, 401)

    const body = await req.json().catch(() => ({}))
    const email = String(body.email ?? '').trim().toLowerCase()
    const firmId = String(body.firm_id ?? '')
    const projectIds: string[] = Array.isArray(body.project_ids) ? body.project_ids.map(String) : []
    const role = ['architect', 'consultant', 'contractor', 'owner'].includes(body.role) ? body.role : 'architect'
    const redirectTo = typeof body.redirect_to === 'string' ? body.redirect_to : undefined
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'That is not an email address.' }, 400)
    if (!firmId) return json({ error: 'No firm given.' }, 400)

    const { data: isAdmin, error: adminError } = await asCaller.rpc('is_firm_admin', { p_firm: firmId })
    if (adminError) return json({ error: adminError.message }, 400)
    if (!isAdmin) return json({ error: 'Only firm admins can invite people.' }, 403)

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

    // The projects must belong to this firm: an admin of one firm cannot hand out another's.
    if (projectIds.length) {
      const { data: mine, error } = await admin.from('projects').select('id').eq('firm_id', firmId).in('id', projectIds)
      if (error) return json({ error: error.message }, 400)
      if ((mine ?? []).length !== new Set(projectIds).size) return json({ error: 'One of those projects is not in this firm.' }, 400)
    }

    let invited = false
    let { data: userId } = await admin.rpc('user_id_for_email', { p_email: email })
    if (!userId) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined)
      if (error) return json({ error: error.message }, 400)
      userId = data.user?.id
      invited = true
    }
    if (!userId) return json({ error: 'The invitation was sent but no account came back.' }, 500)

    const { error: firmError } = await admin.from('firm_members')
      .upsert({ firm_id: firmId, user_id: userId, role: 'member' }, { onConflict: 'firm_id,user_id', ignoreDuplicates: true })
    if (firmError) return json({ error: firmError.message }, 400)
    if (projectIds.length) {
      const { error } = await admin.from('project_members')
        .upsert(projectIds.map((project_id) => ({ project_id, user_id: userId, role })), { onConflict: 'project_id,user_id', ignoreDuplicates: true })
      if (error) return json({ error: error.message }, 400)
    }
    return json({ user_id: userId, invited, projects: projectIds.length })
  } catch (e) {
    return json({ error: (e as Error)?.message ?? String(e) }, 500)
  }
})
