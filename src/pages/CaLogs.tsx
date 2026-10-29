const kinds = [
  ['RFI', 'Requests for Information and architect responses'],
  ['ASI', "Architect's Supplemental Instructions — can push revised sheets into Document control"],
  ['PR', 'Proposal Requests'],
  ['CCD', 'Construction Change Directives'],
  ['CO', 'Change Orders'],
  ['Field reports', 'Site observation reports with photos'],
  ['Punch lists', 'Substantial completion punch items'],
]

export default function CaLogs() {
  return (
    <section>
      <h1>CA logs</h1>
      <p className="lead">Auto-numbered per project, tracked by status, issued on AMR letterhead. Built in Phase 3.</p>
      <table>
        <thead><tr><th>Log</th><th>What it tracks</th></tr></thead>
        <tbody>{kinds.map(([k, d]) => <tr key={k}><td>{k}</td><td>{d}</td></tr>)}</tbody>
      </table>
    </section>
  )
}
