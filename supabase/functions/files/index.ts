// CAzen file links (Supabase Edge Function).
//
// Files live in a private Cloudflare R2 bucket. The browser never holds the R2 key: it asks this
// function for a short-lived signed link to upload (PUT) or download (GET) one file. The function
// checks the caller is signed in and is a member of the project (through the database's own
// row-level security), and that the file sits under that project's folder in the bucket.
//
// Secrets (Supabase dashboard → Edge Functions → Secrets):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { AwsClient } from 'npm:aws4fetch@1.0.20'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const LINK_SECONDS = 15 * 60

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const env = (k: string) => Deno.env.get(k) ?? ''
  const account = env('R2_ACCOUNT_ID'), keyId = env('R2_ACCESS_KEY_ID'), secret = env('R2_SECRET_ACCESS_KEY'), bucket = env('R2_BUCKET')
  const configured = !!(account && keyId && secret && bucket)

  let body: { action?: string; project_id?: string; key?: string }
  try { body = await req.json() } catch { return json({ error: 'Bad request.' }, 400) }

  if (body.action === 'status') return json({ configured })
  if (!configured) return json({ error: 'CAzen file storage isn’t set up yet: the Cloudflare R2 secrets are missing in Supabase.' }, 503)

  // Who is asking, and may they touch this project? The query runs as the caller, so RLS decides.
  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const projectId = body.project_id ?? ''
  const key = body.key ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return json({ error: 'Missing project.' }, 400)
  if (!key.startsWith(projectId + '/') || key.includes('..') || key.includes('\\') || key.length > 900) {
    return json({ error: 'That file isn’t in this project.' }, 400)
  }
  const { data: project, error } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle()
  if (error) return json({ error: 'Sign in again, then retry.' }, 401)
  if (!project) return json({ error: 'You’re not a member of this project.' }, 403)

  const aws = new AwsClient({ accessKeyId: keyId, secretAccessKey: secret, service: 's3', region: 'auto' })
  // R2_ENDPOINT is only for testing against another S3-compatible server.
  const base = `${env('R2_ENDPOINT') || `https://${account}.r2.cloudflarestorage.com`}/${bucket}/`
  const enc = (k: string) => k.split('/').map(encodeURIComponent).join('/')
  const signed = async (method: 'GET' | 'PUT', k: string) => {
    const u = new URL(base + enc(k))
    u.searchParams.set('X-Amz-Expires', String(LINK_SECONDS))
    const r = await aws.sign(new Request(u, { method }), { aws: { signQuery: true } })
    return r.url
  }

  if (body.action === 'put') {
    // Never overwrite: if the name is taken, add " (2)", " (3)"…
    const slash = key.lastIndexOf('/')
    const dir = key.slice(0, slash + 1), file = key.slice(slash + 1)
    const dot = file.lastIndexOf('.')
    const stem = dot > 0 ? file.slice(0, dot) : file, ext = dot > 0 ? file.slice(dot) : ''
    let k = key
    for (let i = 2; i < 500; i++) {
      const head = await aws.fetch(base + enc(k), { method: 'HEAD' })
      if (head.status === 404) break
      if (!head.ok) return json({ error: `File storage answered ${head.status}.` }, 502)
      k = `${dir}${stem} (${i})${ext}`
    }
    return json({ key: k, url: await signed('PUT', k) })
  }

  if (body.action === 'get') return json({ url: await signed('GET', key) })

  return json({ error: 'Unknown action.' }, 400)
})
