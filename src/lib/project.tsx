import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { db } from './supabase'
import type { Project } from './types'

const KEY = 'cazen.currentProject'

function readSaved(): string | null {
  try { return localStorage.getItem(KEY) } catch { return null }
}
function writeSaved(id: string | null) {
  try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY) } catch { /* private mode */ }
}

interface ProjectState {
  projects: Project[]
  current: Project | null
  select: (id: string | null) => void
  reload: () => Promise<void>
  loading: boolean
}

const ProjectContext = createContext<ProjectState>({
  projects: [], current: null, select: () => {}, reload: async () => {}, loading: true,
})

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [currentId, setCurrentId] = useState<string | null>(readSaved())
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const { data, error } = await db().from('projects').select('*').order('number', { ascending: false })
    if (!error && data) setProjects(data as Project[])
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  const select = (id: string | null) => {
    setCurrentId(id)
    writeSaved(id)
  }

  const current = projects.find((p) => p.id === currentId) ?? null
  return (
    <ProjectContext.Provider value={{ projects, current, select, reload, loading }}>
      {children}
    </ProjectContext.Provider>
  )
}

export const useProject = () => useContext(ProjectContext)
