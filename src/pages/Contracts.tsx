import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageTitle } from '../components/PageTitle'
import { Money } from '../components/Money'
import { useProject } from '../lib/project'
import { message } from '../lib/errors'
import { today, usDate } from '../lib/dates'
import { openFile } from '../lib/files'
import { percent } from '../lib/money'
import {
  addContractDocument, CONTRACT_TABS, listContractDocuments, removeContractDocument,
  setContractDocument, type ContractDocument, type ContractKind,
} from '../lib/contracts'
import { listContracts, loadContract, type LoadedContract } from '../lib/payappsDb'

/**
 * The contract library.
 *
 * What was agreed, as signed — the documents every other argument on the job is settled
 * against. Executed ones are locked, because a contract that can be quietly replaced is not a
 * contract; what changes one is a change order, and those are read from the schedule of values
 * rather than typed again here.
 */
export default function Contracts() {
  const { current } = useProject()
  const [tab, setTab] = useState<ContractKind>('owner_contractor')
  const [docs, setDocs] = useState<ContractDocument[] | null>(null)
  const [money, setMoney] = useState<LoadedContract | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const projectId = current?.id
  const load = useCallback(() => {
    if (!projectId) { setDocs([]); return }
    listContractDocuments(projectId).then(setDocs).catch((e) => setError(message(e)))
    listContracts(projectId)
      .then((cs) => (cs[0] ? loadContract(cs[0].id) : null))
      .then(setMoney)
      .catch(() => setMoney(null))
  }, [projectId])
  useEffect(() => { load() }, [load])

  const here = (docs ?? []).filter((d) => d.kind === tab)
  const counts = useMemo(() => {
    const n = new Map<ContractKind, number>()
    for (const d of docs ?? []) n.set(d.kind, (n.get(d.kind) ?? 0) + 1)
    return n
  }, [docs])

  const about = CONTRACT_TABS.find((t) => t.kind === tab)!

  return (
    <section>
      <div className="page-head">
        <div>
          <PageTitle>Contracts</PageTitle>
          <p className="lead">
            {current ? <>{current.number} {current.name} · </> : null}
            What was agreed, as signed. Executed documents are read-only; what changes one is a
            change order.
          </p>
        </div>
        <button className="primary" disabled={!current} onClick={() => setAdding(true)}>Add a document</button>
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="tabs" role="tablist">
        {CONTRACT_TABS.map((t) => (
          <button key={t.kind} role="tab" aria-selected={tab === t.kind}
            className={tab === t.kind ? 'on' : ''} onClick={() => setTab(t.kind)}>
            {t.label}
            {counts.get(t.kind) ? <span className="tag">{counts.get(t.kind)}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'owner_contractor' && <ContractSum data={money} />}

      <div className="card">
        <h3>{about.label}</h3>
        <p className="muted small">{about.about}</p>
        {!docs ? <p className="muted small">Loading…</p>
          : !here.length ? <p className="muted small">Nothing filed here yet.</p> : (
            <div className="contract-list">
              {here.map((d) => (
                <Row key={d.id} doc={d} project={current}
                  onChanged={(next) => setDocs((all) => (all ?? []).map((x) => (x.id === next.id ? next : x)))}
                  onRemoved={() => setDocs((all) => (all ?? []).filter((x) => x.id !== d.id))}
                  onTrouble={setError} />
              ))}
            </div>
          )}
      </div>

      {adding && current && (
        <AddDocument project={current} kind={tab}
          onDone={() => { setAdding(false); load() }}
          onCancel={() => setAdding(false)}
          onTrouble={setError} />
      )}
    </section>
  )
}

/**
 * What the contract is worth now.
 *
 * The original sum, every change order that has moved it, and the sum to date. These come from
 * the schedule of values rather than from anything typed here, so this figure and the one on
 * the applications for payment cannot disagree.
 */
function ContractSum({ data }: { data: LoadedContract | null }) {
  if (!data) {
    return (
      <div className="card muted">
        No contract sum set up yet. It is entered with{' '}
        <Link to="/pay">the applications for payment</Link>, which is where it is used.
      </div>
    )
  }
  const orders = data.lines.filter((l) => l.change_order_id && !l.is_heading)
  const net = orders.reduce((t, l) => t + l.scheduled_value, 0)
  const sum = data.contract.original_sum + net

  return (
    <div className="card">
      <h3>What the contract is worth</h3>
      <div className="pay-figures">
        <div className="pay-figure">
          <span className="pay-figure-label">Original sum</span>
          <strong className="pay-figure-value"><Money n={data.contract.original_sum} /></strong>
        </div>
        <div className="pay-figure">
          <span className="pay-figure-label">Change orders</span>
          <strong className="pay-figure-value"><Money n={net} /></strong>
          <span className="muted small">
            {orders.length ? `${orders.length} ${orders.length === 1 ? 'order' : 'orders'}` : 'none yet'}
          </span>
        </div>
        <div className="pay-figure">
          <span className="pay-figure-label">Sum to date</span>
          <strong className="pay-figure-value"><Money n={sum} /></strong>
          <span className="muted small">
            {net ? `${percent((net / data.contract.original_sum) * 100)} of the original` : 'unchanged'}
          </span>
        </div>
      </div>
      {orders.length > 0 && (
        <table className="pay-trades">
          <thead><tr><th>Change order</th><th>Approved</th><th className="right">Amount</th></tr></thead>
          <tbody>
            {orders.map((l) => (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td className="muted small">{l.approved_on ? usDate(l.approved_on) : 'date not set'}</td>
                <td className="right mono"><Money n={l.scheduled_value} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small">
        Read from the schedule of values, so this and{' '}
        <Link to="/pay">the applications for payment</Link> cannot disagree.
      </p>
    </div>
  )
}

function Row({ doc, project, onChanged, onRemoved, onTrouble }: {
  doc: ContractDocument
  project: { id: string; name: string } | null
  onChanged: (d: ContractDocument) => void
  onRemoved: () => void
  onTrouble: (m: string) => void
}) {
  const locked = doc.is_locked
  return (
    <div className={`contract-row${locked ? ' locked' : ''}`}>
      <button className="link contract-title" onClick={() => {
        if (!project) return
        openFile(project, doc.file_path).catch((e) => onTrouble(message(e)))
      }}>{doc.title}</button>
      {locked ? (
        <span className="muted small nowrap">Executed {usDate(doc.executed_on)}</span>
      ) : (
        <label className="inline-field small">Executed
          <input type="date" value={doc.executed_on ?? ''} onChange={(e) => {
            const executed_on = e.target.value || null
            onChanged({ ...doc, executed_on })
            setContractDocument(doc.id, { executed_on }).catch((err) => onTrouble(message(err)))
          }} />
        </label>
      )}
      {locked ? (
        <span className="tag">locked</span>
      ) : (
        <button className="link" disabled={!doc.executed_on} onClick={() => {
          onChanged({ ...doc, is_locked: true })
          setContractDocument(doc.id, { is_locked: true }).catch((e) => onTrouble(message(e)))
        }}>Lock it</button>
      )}
      {!locked && (
        <button className="link danger-link" onClick={() => {
          onRemoved()
          removeContractDocument(doc.id).catch((e) => onTrouble(message(e)))
        }}>Remove</button>
      )}
    </div>
  )
}

function AddDocument({ project, kind, onDone, onCancel, onTrouble }: {
  project: { id: string; name: string }
  kind: ContractKind
  onDone: () => void
  onCancel: () => void
  onTrouble: (m: string) => void
}) {
  const file = useRef<HTMLInputElement | null>(null)
  const [title, setTitle] = useState('')
  const [executedOn, setExecutedOn] = useState('')
  const [picked, setPicked] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!picked || busy) return
    setBusy(true)
    try {
      await addContractDocument(project, {
        kind,
        title: title.trim() || picked.name.replace(/\.pdf$/i, ''),
        executed_on: executedOn || null,
        bytes: new Uint8Array(await picked.arrayBuffer()),
        fileName: title.trim() || picked.name,
      })
      onDone()
    } catch (e) { onTrouble(message(e)) } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <h3>Add a document</h3>
      <div className="pay-add-fields">
        <label className="stack pay-add-wide">What it is
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={picked ? picked.name.replace(/\.pdf$/i, '') : 'A101 Owner–Contractor Agreement'} />
        </label>
        <label className="stack">Executed
          <input type="date" value={executedOn} max={today()} onChange={(e) => setExecutedOn(e.target.value)} />
        </label>
      </div>
      <div className="folder-actions">
        <button onClick={() => file.current?.click()}>{picked ? picked.name : 'Choose a PDF'}</button>
        <button className="primary-lite" disabled={!picked || busy} onClick={() => void save()}>
          {busy ? 'Filing…' : 'File it'}
        </button>
        <button className="link" onClick={onCancel}>Cancel</button>
      </div>
      <input ref={file} type="file" accept="application/pdf" hidden
        onChange={(e) => setPicked(e.target.files?.[0] ?? null)} />
      <p className="muted small">
        A document filed with an execution date is filed as a record and locked. One without is a
        draft, and can be dated and locked later.
      </p>
    </div>
  )
}
