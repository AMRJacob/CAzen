import { useState } from 'react'
import IssueForm from './IssueForm'
import { FORM_LABELS } from '../lib/templates/fields'
import type { FormKind } from '../lib/templates/types'

const KINDS: FormKind[] = ['field_report', 'asi', 'rfi_response', 'pr', 'ccd']

export default function CaLogs() {
  const [kind, setKind] = useState<FormKind>('field_report')
  return (
    <section>
      <h1>Document creation</h1>
      <p className="lead">Write a field report, ASI, RFI response, proposal request or CCD and download it on your firm’s template. Numbered logs for each are next.</p>
      <div className="tabs" role="tablist">
        {KINDS.map((k) => (
          <button key={k} role="tab" aria-selected={k === kind} className={k === kind ? 'on' : ''} onClick={() => setKind(k)}>{FORM_LABELS[k]}</button>
        ))}
      </div>
      <IssueForm key={kind} kind={kind} />
    </section>
  )
}
