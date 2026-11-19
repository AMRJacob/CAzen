import { db } from './supabase'
import type { Application, Contract, RetainageStep, SovLine, Billed } from './payapps'

/** Reading and writing pay applications. The arithmetic lives in payapps.ts and stays there. */

export interface LoadedContract {
  contract: Contract & { name: string | null; contractor: string | null }
  lines: SovLine[]
  steps: RetainageStep[]
  applications: Application[]
  /** What each application billed, keyed by application id then by line id. */
  billed: Map<string, Map<string, Billed>>
}

export async function listContracts(projectId: string) {
  const { data, error } = await db()
    .from('pay_contracts').select('*').eq('project_id', projectId).order('created_at')
  if (error) throw error
  return (data ?? []) as (Contract & { name: string | null; contractor: string | null })[]
}

export async function loadContract(contractId: string): Promise<LoadedContract> {
  const client = db()
  const [c, l, s, a] = await Promise.all([
    client.from('pay_contracts').select('*').eq('id', contractId).single(),
    client.from('sov_lines').select('*').eq('contract_id', contractId).order('sort'),
    client.from('retainage_steps').select('*').eq('contract_id', contractId).order('at_percent'),
    client.from('pay_apps').select('*').eq('contract_id', contractId).order('number'),
  ])
  for (const r of [c, l, s, a]) if (r.error) throw r.error

  const applications = (a.data ?? []) as Application[]
  const billed = new Map<string, Map<string, Billed>>()
  if (applications.length) {
    const { data: rows, error } = await client
      .from('pay_app_lines').select('*').in('pay_app_id', applications.map((x) => x.id))
    if (error) throw error
    for (const app of applications) billed.set(app.id, new Map())
    for (const r of (rows ?? []) as { pay_app_id: string; sov_line_id: string; this_period: number; stored: number }[]) {
      billed.get(r.pay_app_id)?.set(r.sov_line_id, { this_period: Number(r.this_period), stored: Number(r.stored) })
    }
  }

  const num = (v: unknown) => Number(v ?? 0)
  return {
    contract: {
      ...(c.data as Contract & { name: string | null; contractor: string | null }),
      original_sum: num((c.data as { original_sum: unknown }).original_sum),
      retainage_work: num((c.data as { retainage_work: unknown }).retainage_work),
      retainage_stored: num((c.data as { retainage_stored: unknown }).retainage_stored),
    },
    lines: ((l.data ?? []) as SovLine[]).map((x) => ({
      ...x,
      scheduled_value: num(x.scheduled_value),
      retainage_rate: x.retainage_rate == null ? null : num(x.retainage_rate),
      // A line can be a change order before anybody has linked it to the register entry.
      change_order_id: x.change_order_id ?? ((x as unknown as { is_change_order?: boolean }).is_change_order ? 'unlinked' : null),
    })),
    steps: ((s.data ?? []) as RetainageStep[]).map((x) => ({ at_percent: num(x.at_percent), rate: num(x.rate) })),
    applications,
    billed,
  }
}

/** Start the next application. Its period is the day it is made unless somebody says otherwise. */
export async function newApplication(contractId: string, next: number, periodTo: string): Promise<string> {
  const { data: u } = await db().auth.getUser()
  const { data, error } = await db()
    .from('pay_apps')
    .insert({ contract_id: contractId, number: next, period_to: periodTo, applied_on: periodTo, status: 'draft', created_by: u.user?.id ?? null })
    .select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

/** What one line was billed this period. Zero on both means the row is removed rather than stored. */
export async function setBilled(payAppId: string, sovLineId: string, value: Billed): Promise<void> {
  if (!value.this_period && !value.stored) {
    const { error } = await db().from('pay_app_lines').delete().eq('pay_app_id', payAppId).eq('sov_line_id', sovLineId)
    if (error) throw error
    return
  }
  const { error } = await db()
    .from('pay_app_lines')
    .upsert({ pay_app_id: payAppId, sov_line_id: sovLineId, this_period: value.this_period, stored: value.stored },
      { onConflict: 'pay_app_id,sov_line_id' })
  if (error) throw error
}

export async function setApplication(id: string, patch: Partial<Application>): Promise<void> {
  const { error } = await db().from('pay_apps').update(patch).eq('id', id)
  if (error) throw error
}

export async function addSovLine(contractId: string, line: {
  item_no: string | null
  description: string
  scheduled_value: number
  sort: number
  is_heading?: boolean
  is_change_order?: boolean
  approved_on?: string | null
}): Promise<void> {
  const { error } = await db().from('sov_lines').insert({ contract_id: contractId, ...line })
  if (error) throw error
}

export async function removeSovLine(id: string): Promise<void> {
  const { error } = await db().from('sov_lines').delete().eq('id', id)
  if (error) throw error
}

export async function setSovLine(id: string, patch: Partial<SovLine>): Promise<void> {
  const { error } = await db().from('sov_lines').update(patch).eq('id', id)
  if (error) throw error
}

export async function setSteps(contractId: string, steps: RetainageStep[]): Promise<void> {
  const client = db()
  const { error: wipe } = await client.from('retainage_steps').delete().eq('contract_id', contractId)
  if (wipe) throw wipe
  if (!steps.length) return
  const { error } = await client.from('retainage_steps')
    .insert(steps.map((s) => ({ contract_id: contractId, at_percent: s.at_percent, rate: s.rate })))
  if (error) throw error
}

export async function setContract(id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db().from('pay_contracts').update(patch).eq('id', id)
  if (error) throw error
}

/**
 * Set a contract up: the agreement's figures and its schedule of values, in one go.
 *
 * The lines go in as one insert, so a schedule of two hundred lines is one request and either
 * all of it arrives or none of it does. If they fail, the contract that was just made is taken
 * back rather than left behind empty.
 */
export async function createContract(projectId: string, contract: {
  contractor: string | null
  name: string | null
  original_sum: number
  retainage_work: number
  retainage_stored: number
}, lines: { item_no: string | null; description: string; scheduled_value: number; is_heading: boolean }[]): Promise<string> {
  const client = db()
  const { data: u } = await client.auth.getUser()
  const { data, error } = await client.from('pay_contracts')
    .insert({ project_id: projectId, ...contract, created_by: u.user?.id ?? null })
    .select('id').single()
  if (error) throw error
  const id = (data as { id: string }).id
  if (lines.length) {
    const { error: lineError } = await client.from('sov_lines')
      .insert(lines.map((l, i) => ({ contract_id: id, ...l, sort: (i + 1) * 10 })))
    if (lineError) {
      await client.from('pay_contracts').delete().eq('id', id)
      throw lineError
    }
  }
  return id
}
