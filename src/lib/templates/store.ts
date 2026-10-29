import { db } from '../supabase'
import { defaultLayout } from './defaults'
import type { Layout, TemplateKind } from './types'

/** A firm's saved layout for a template kind, or the default when none is saved. */
export async function loadLayout(firmId: string, kind: TemplateKind): Promise<Layout> {
  const { data } = await db().from('doc_templates').select('settings').eq('firm_id', firmId).eq('kind', kind).maybeSingle()
  const saved = (data?.settings as { layout?: Layout } | null)?.layout
  return saved?.elements ? saved : defaultLayout(kind)
}

export async function loadLayouts(firmId: string, kinds: TemplateKind[]): Promise<Record<string, Layout>> {
  const { data } = await db().from('doc_templates').select('kind, settings').eq('firm_id', firmId).in('kind', kinds)
  const out: Record<string, Layout> = {}
  for (const k of kinds) {
    const row = data?.find((r) => r.kind === k)
    const saved = (row?.settings as { layout?: Layout } | null)?.layout
    out[k] = saved?.elements ? saved : defaultLayout(k)
  }
  return out
}

export async function saveLayout(firmId: string, kind: TemplateKind, layout: Layout) {
  const { data: u } = await db().auth.getUser()
  const { error } = await db().from('doc_templates').upsert({
    firm_id: firmId, kind, settings: { layout }, updated_at: new Date().toISOString(), updated_by: u.user?.id,
  })
  if (error) throw error
}
