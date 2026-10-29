import IssueForm from './IssueForm'

export default function Submittals() {
  return (
    <section>
      <h1>Submittals</h1>
      <p className="lead">Fill in the review, attach the contractor’s PDF, and download the returned package with your transmittal on top.</p>
      <IssueForm kind="submittal_cover" />
    </section>
  )
}
