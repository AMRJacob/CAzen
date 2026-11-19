import { deleteStoredFiles, type ProjectStore } from './files'
import { remove as localRemove } from './offline/store'
import { removeObservation, type Observation } from './observations'
import { removePad } from './pads'
import { removeVisit, type SiteVisit } from './visits'

/**
 * Take a page out of a notebook, and what belongs to nothing but that page with it.
 *
 * A page's sketch and its photographs can be reached from the page and from nowhere else, so a
 * page torn out and its sketch left behind is a sketch nobody can ever open or remove. They go
 * with the page. Observations are different — they are on the Observations list and on the
 * drawings in their own right — so those go only if asked.
 *
 * The page and sketch go through the same queue as everything else, so this works with no
 * signal. The photograph files themselves are removed from storage straight away, which needs a
 * connection; without one they are taken off this device and left in storage.
 */
export async function tearOut(project: ProjectStore, page: SiteVisit, alsoRemove: Observation[] = []): Promise<void> {
  if (page.pad_id) await removePad(page.pad_id)
  await removeVisit(page.id)
  for (const o of alsoRemove) await removeObservation(o)
  const files = [...(page.photos ?? []), ...alsoRemove.flatMap((o) => o.photos ?? [])]
  for (const path of files) await localRemove('files', path).catch(() => {})
  if (files.length && navigator.onLine) await deleteStoredFiles(project, files).catch(() => { /* the page is gone either way */ })
}
