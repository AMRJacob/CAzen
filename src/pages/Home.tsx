export default function Home() {
  return (
    <section>
      <h1>Projects</h1>
      <p className="lead">
        Each project holds its drawing set, project manual, contract documents, CA logs and submittals.
      </p>
      <div className="card muted">
        Project list connects in Phase 1 once Supabase is set up. Schema: <code>supabase/migrations/0001_init.sql</code>.
      </div>
    </section>
  )
}
