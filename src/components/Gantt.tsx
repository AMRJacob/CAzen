import { along, monthsIn, span, type Activity } from '../lib/schedule'
import { usDate } from '../lib/dates'

/**
 * The schedule, drawn.
 *
 * One row per activity, time running left to right across whatever the schedule spans. The
 * bar is the activity's dates and the darker part of it is what the contractor says is done,
 * so "behind" is visible as a bar whose fill stops short of today's line rather than as a
 * number somebody has to work out.
 */
export function Gantt({ activities, today }: { activities: Activity[]; today: string }) {
  const range = span(activities)
  if (!range) {
    return <p className="muted small">Nothing to draw until the activities have dates on them.</p>
  }
  const months = monthsIn(range.from, range.to)
  const now = along(today, range.from, range.to)
  const inView = today >= range.from && today <= range.to

  return (
    <div className="gantt">
      <div className="gantt-scale" aria-hidden="true">
        {months.map((m) => (
          <span key={m.label + m.at} className="gantt-month" style={{ left: `${m.at * 100}%` }}>{m.label}</span>
        ))}
      </div>
      <div className="gantt-rows">
        {months.map((m) => (
          <span key={`rule-${m.label}-${m.at}`} className="gantt-rule" style={{ left: `${m.at * 100}%` }} aria-hidden="true" />
        ))}
        {inView && <span className="gantt-today" style={{ left: `${now * 100}%` }} aria-label={`Today, ${usDate(today)}`} />}

        {activities.map((a) => {
          if (a.is_heading) {
            return <div key={a.id} className="gantt-row gantt-heading"><span className="gantt-name">{a.name}</span></div>
          }
          const from = a.starts_on
          const to = a.ends_on ?? a.starts_on
          if (!from || !to) {
            return (
              <div key={a.id} className="gantt-row">
                <span className="gantt-name">{a.name}</span>
                <span className="gantt-undated muted small">no dates</span>
              </div>
            )
          }
          const left = along(from, range.from, range.to)
          const right = along(to, range.from, range.to)
          const width = Math.max(0.004, right - left)
          // Behind is only meaningful once the activity has started and time has passed in it.
          const due = to <= today ? 100 : from >= today ? 0 : along(today, from, to) * 100
          const behind = a.percent + 0.5 < due
          return (
            <div key={a.id} className="gantt-row">
              <span className="gantt-name" title={`${usDate(from)} to ${usDate(to)}`}>{a.name}</span>
              <span className={`gantt-bar${behind ? ' behind' : ''}`}
                style={{ left: `${left * 100}%`, width: `${width * 100}%` }}>
                <span className="gantt-done" style={{ width: `${a.percent}%` }} />
                <span className="gantt-pc">{Math.round(a.percent)}%</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
