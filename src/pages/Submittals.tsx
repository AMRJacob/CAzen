import { PageTitle } from '../components/PageTitle'
import IssueForm from './IssueForm'

export default function Submittals() {
  return (
    <section>
      <PageTitle>Submittals</PageTitle>
      <p className="lead">Fill in the review, attach the contractor’s PDF, and download the returned package with your transmittal on top.</p>
      <IssueForm kind="submittal_cover" />
    </section>
  )
}
