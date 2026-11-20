import { useNavigate } from 'react-router-dom'
import { useProject } from '../lib/project'
import { TradeBoard } from '../components/TradeBoard'

/** The trade board on its own address, so it can be reached from pay applications and the schedule alike. */
export default function Trades() {
  const { current } = useProject()
  const navigate = useNavigate()
  if (!current) return <p className="muted">Choose a project first.</p>
  return <TradeBoard projectId={current.id} onClose={() => (window.history.length > 1 ? navigate(-1) : navigate('/pay'))} />
}
