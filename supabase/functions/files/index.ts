// CAzen file links (Supabase Edge Function).
//
// Files live in a private Cloudflare R2 bucket. The browser never holds the R2 key: it asks this
// function for a short-lived signed link to upload (PUT) or download (GET) one file. The function
// checks the caller is signed in and is a member of the project (through the database's own
// row-level security), and that the file sits under that project's folder in the bucket.
//
// It also keeps the bucket under the firm's cap (firms.storage_cap_gb, max_file_mb), counting what's
// actually in the bucket (storage_usage), so the figure stays right even after files are removed
// in Cloudflare.
//
// Secrets (Supabase dashboard → Edge Functions → Secrets):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
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
const RECOUNT_AFTER_MS = 10 * 60 * 1000
const GB = 1024 ** 3, MB = 1024 ** 2
const human = (b: number) => (b >= GB ? `${(b / GB).toFixed(2)} GB` : b >= MB ? `${(b / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

interface Usage { bytes: number; objects: number; by_project: Record<string, { bytes: number; objects: number }>; counted_at: string | null }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)

  const env = (k: string) => Deno.env.get(k) ?? ''
  const account = env('R2_ACCOUNT_ID'), keyId = env('R2_ACCESS_KEY_ID'), secret = env('R2_SECRET_ACCESS_KEY'), bucket = env('R2_BUCKET')
  const configured = !!(account && keyId && secret && bucket)

  let body: { action?: string; project_id?: string; key?: string; keys?: string[]; size?: number; fresh?: boolean }
  try { body = await req.json() } catch { return json({ error: 'Bad request.' }, 400) }

  if (body.action === 'status') return json({ configured })
  if (!configured) return json({ error: 'CAzen file storage isn’t set up yet: the Cloudflare R2 secrets are missing in Supabase.' }, 503)

  // Who is asking, and may they touch this project? The query runs as the caller, so RLS decides.
  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
  const aws = new AwsClient({ accessKeyId: keyId, secretAccessKey: secret, service: 's3', region: 'auto' })
  // R2_ENDPOINT is only for testing against another S3-compatible server.
  const base = `${env('R2_ENDPOINT') || `https://${account}.r2.cloudflarestorage.com`}/${bucket}/`
  const enc = (k: string) => k.split('/').map(encodeURIComponent).join('/')

  // The caller's firm and its limits (the query runs as the caller, so RLS decides).
  const { data: firm, error: firmErr } = await supabase.from('firms').select('id, storage_cap_gb, max_file_mb').order('created_at').limit(1).maybeSingle()
  if (firmErr) return json({ error: 'Sign in again, then retry.' }, 401)
  if (!firm) return json({ error: 'You’re not a member of this firm.' }, 403)
  const capBytes = Number(firm.storage_cap_gb) * GB, maxFile = Number(firm.max_file_mb) * MB

  // Count what's actually in the bucket, in total and per project (the first part of each key).
  async function recount(): Promise<Usage> {
    const u: Usage = { bytes: 0, objects: 0, by_project: {}, counted_at: new Date().toISOString() }
    let token = ''
    do {
      const q = new URL(base)
      q.searchParams.set('list-type', '2')
      q.searchParams.set('max-keys', '1000')
      if (token) q.searchParams.set('continuation-token', token)
      const r = await aws.fetch(q.toString())
      if (!r.ok) throw new Error(`File storage answered ${r.status} while counting.`)
      const xml = await r.text()
      for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const k = decodeXml(m[1].match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? '')
        const size = Number(m[1].match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0)
        const pid = k.split('/')[0] || 'other'
        u.bytes += size
        u.objects++
        const p = (u.by_project[pid] ??= { bytes: 0, objects: 0 })
        p.bytes += size
        p.objects++
      }
      token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? decodeXml(xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] ?? '') : ''
    } while (token)
    await admin.from('storage_usage').upsert({ firm_id: firm!.id, ...u })
    return u
  }
  async function usage(fresh = false): Promise<Usage> {
    const { data } = await admin.from('storage_usage').select('bytes, objects, by_project, counted_at').eq('firm_id', firm!.id).maybeSingle()
    const stale = !data?.counted_at || Date.now() - new Date(data.counted_at).getTime() > RECOUNT_AFTER_MS
    return fresh || stale ? recount() : (data as Usage)
  }
  const limits = { cap_bytes: capBytes, max_file_bytes: maxFile }

  if (body.action === 'usage') {
    try { return json({ ...(await usage(!!body.fresh)), ...limits }) } catch (e) { return json({ error: (e as Error).message }, 502) }
  }

  // --- Deleting (firm admins only). Records are deleted first by the app; then the files go. ---
  if (body.action === 'delete' || body.action === 'delete_project') {
    const { data: isAdmin } = await supabase.rpc('is_firm_admin', { p_firm: firm.id })
    if (!isAdmin) return json({ error: 'Only firm admins can delete files.' }, 403)
    const pid = body.project_id ?? ''
    if (!/^[0-9a-f-]{36}$/i.test(pid)) return json({ error: 'Missing project.' }, 400)
    let keys: string[]
    if (body.action === 'delete') {
      keys = (body.keys ?? []).filter((k) => typeof k === 'string')
      if (keys.some((k) => !k.startsWith(pid + '/') || k.includes('..'))) return json({ error: 'Those files aren’t all in this project.' }, 400)
    } else {
      keys = []
      let token = ''
      do {
        const q = new URL(base)
        q.searchParams.set('list-type', '2')
        q.searchParams.set('prefix', pid + '/')
        if (token) q.searchParams.set('continuation-token', token)
        const r = await aws.fetch(q.toString())
        if (!r.ok) return json({ error: `File storage answered ${r.status} while listing.` }, 502)
        const xml = await r.text()
        for (const m of xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)) keys.push(decodeXml(m[1]))
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? decodeXml(xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] ?? '') : ''
      } while (token)
    }
    let deleted = 0, failed = 0
    for (const k of keys) {
      const r = await aws.fetch(base + enc(k), { method: 'DELETE' })
      if (r.ok || r.status === 404) deleted++
      else failed++
    }
    let u: Usage | null = null
    try { u = await recount() } catch { /* the next count catches up */ }
    return json({ deleted, failed, usage: u })
  }

  const projectId = body.project_id ?? ''
  const key = body.key ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return json({ error: 'Missing project.' }, 400)
  if (!key.startsWith(projectId + '/') || key.includes('..') || key.includes('\\') || key.length > 900) {
    return json({ error: 'That file isn’t in this project.' }, 400)
  }
  const { data: project, error } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle()
  if (error) return json({ error: 'Sign in again, then retry.' }, 401)
  if (!project) return json({ error: 'You’re not a member of this project.' }, 403)
  const signed = async (method: 'GET' | 'PUT', k: string) => {
    const u = new URL(base + enc(k))
    u.searchParams.set('X-Amz-Expires', String(LINK_SECONDS))
    const r = await aws.sign(new Request(u, { method }), { aws: { signQuery: true } })
    return r.url
  }

  if (body.action === 'put') {
    const size = Number(body.size)
    if (!Number.isFinite(size) || size <= 0) return json({ error: 'Missing file size.' }, 400)
    if (size > maxFile) {
      return json({ error: `This file is ${human(size)}; the limit is ${human(maxFile)} a file. An admin can change it in Settings.` }, 413)
    }
    let u: Usage
    try { u = await usage() } catch (e) { return json({ error: (e as Error).message }, 502) }
    if (u.bytes + size > capBytes) {
      return json({ error: `CAzen file storage is full: ${human(u.bytes)} of ${human(capBytes)} used. An admin can raise the limit in Settings once billing is set up in Cloudflare.` }, 507)
    }
    // Count it now, so a batch of uploads can't slip past the cap between counts.
    const p = (u.by_project[projectId] ??= { bytes: 0, objects: 0 })
    p.bytes += size
    p.objects++
    await admin.from('storage_usage').upsert({ firm_id: firm.id, bytes: u.bytes + size, objects: u.objects + 1, by_project: u.by_project, counted_at: u.counted_at })

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

  // After an upload: check the stored file really is within the per-file limit.
  if (body.action === 'confirm') {
    // Ask for the first byte: the reply's Content-Range carries the full size ("bytes 0-0/12345").
    const probe = await aws.fetch(base + enc(key), { headers: { Range: 'bytes=0-0' } })
    if (probe.status === 404) return json({ error: 'The upload didn’t arrive.' }, 404)
    if (!probe.ok) return json({ error: `File storage answered ${probe.status}.` }, 502)
    await probe.arrayBuffer()
    const size = Number(probe.headers.get('content-range')?.split('/')[1] ?? probe.headers.get('content-length') ?? 0)
    if (size > maxFile) {
      await aws.fetch(base + enc(key), { method: 'DELETE' })
      return json({ error: `That file was ${human(size)}, over the ${human(maxFile)} limit, so it was removed.` }, 413)
    }
    return json({ ok: true, size })
  }

  return json({ error: 'Unknown action.' }, 400)
})

function decodeXml(s: string) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}
