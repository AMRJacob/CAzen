import { moneyParts, NOTHING } from '../lib/money'

/**
 * A figure in a column of figures.
 *
 * Dropping ".00" reads better but breaks the decimal column, so the cents are rendered as
 * their own span and a whole-dollar figure gets an invisible one of the same width. The
 * points stay in a line; the zeros stay out of sight.
 */
export function Money({ n, strong }: { n: number; strong?: boolean }) {
  const { whole, cents } = moneyParts(n)
  const body = (
    <span className={`money${whole === NOTHING ? ' money-nothing' : ''}`}>
      {whole}
      {cents ? <span className="money-cents">{cents}</span>
             : <span className="money-cents money-pad" aria-hidden="true">.00</span>}
    </span>
  )
  return strong ? <strong>{body}</strong> : body
}
