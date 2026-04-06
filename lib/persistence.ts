import type { Project, ProjectSummary } from './types/project'
import { conditionsToInk } from './conditions'

const INDEX_KEY = 'filmgame:projects:index'
const projectKey = (id: string) => `filmgame:project:${id}`

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const lsTimers = new Map<string, ReturnType<typeof setTimeout>>()
const DEBOUNCE_MS = 500
const LS_DEBOUNCE_MS = 300

export function listProjects(): ProjectSummary[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]')
  } catch { return [] }
}

export function loadProject(id: string): Project | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(projectKey(id))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export async function loadProjectWithFallback(id: string): Promise<Project | null> {
  const local = loadProject(id)
  try {
    const res = await fetch(`/api/projects/${id}`)
    if (res.ok) {
      const { project: serverData } = await res.json()
      if (serverData) {
        if (local && local.updatedAt && serverData.updatedAt) {
          if (new Date(local.updatedAt) > new Date(serverData.updatedAt)) {
            return local
          }
        }
        try {
          localStorage.setItem(projectKey(id), JSON.stringify(serverData))
          updateIndex(serverData)
        } catch { /* ignore */ }
        return serverData
      }
    }
  } catch { /* server unavailable, fall through */ }
  return local
}

function updateIndex(project: Project): void {
  const summaries = listProjects()
  const summary: ProjectSummary = {
    id: project.id,
    title: project.title,
    updatedAt: project.updatedAt,
    currentPhase: project.currentPhase,
    nodeCount: project.nodes.length,
  }
  const idx = summaries.findIndex(s => s.id === project.id)
  if (idx >= 0) summaries[idx] = summary
  else summaries.unshift(summary)
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(summaries)) } catch { /* ignore */ }
}

function syncToServer(project: Project): void {
  const existing = saveTimers.get(project.id)
  if (existing) clearTimeout(existing)
  saveTimers.set(project.id, setTimeout(() => {
    saveTimers.delete(project.id)
    fetch(`/api/projects/${project.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    }).catch(() => {})
  }, DEBOUNCE_MS))
}

export function saveProject(project: Project): void {
  if (typeof window === 'undefined') return
  updateIndex(project)
  syncToServer(project)
  const existingLs = lsTimers.get(project.id)
  if (existingLs) clearTimeout(existingLs)
  lsTimers.set(project.id, setTimeout(() => {
    lsTimers.delete(project.id)
    try {
      localStorage.setItem(projectKey(project.id), JSON.stringify(project))
    } catch (e) {
      console.error('[persistence] localStorage 写入失败（可能已满）:', e)
      window.dispatchEvent(new CustomEvent('filmgame:storage-error', {
        detail: { message: '本地存储空间不足，请前往项目列表清理旧项目' },
      }))
    }
  }, LS_DEBOUNCE_MS))
}

export function deleteProject(id: string): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(projectKey(id))
  const summaries = listProjects().filter(s => s.id !== id)
  localStorage.setItem(INDEX_KEY, JSON.stringify(summaries))
}

const ARCHIVE_INDEX_KEY = 'filmgame:projects:archive-index'
const archiveProjectKey = (id: string) => `filmgame:archive:${id}`

export function listArchivedProjects(): ProjectSummary[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(ARCHIVE_INDEX_KEY) || '[]')
  } catch { return [] }
}

export function archiveProject(id: string): void {
  if (typeof window === 'undefined') return
  const project = loadProject(id)
  if (!project) return
  const archivedAt = new Date().toISOString()
  const archived = { ...project, archived: true, archivedAt }
  try {
    localStorage.setItem(archiveProjectKey(id), JSON.stringify(archived))
    const summary: ProjectSummary = {
      id: project.id,
      title: project.title,
      updatedAt: project.updatedAt,
      currentPhase: project.currentPhase,
      nodeCount: project.nodes.length,
      archived: true,
      archivedAt,
    }
    const archiveIndex = listArchivedProjects().filter(s => s.id !== id)
    archiveIndex.unshift(summary)
    localStorage.setItem(ARCHIVE_INDEX_KEY, JSON.stringify(archiveIndex))
  } catch { /* ignore */ }
  localStorage.removeItem(projectKey(id))
  const summaries = listProjects().filter(s => s.id !== id)
  localStorage.setItem(INDEX_KEY, JSON.stringify(summaries))
}

export function restoreProject(id: string): void {
  if (typeof window === 'undefined') return
  const raw = localStorage.getItem(archiveProjectKey(id))
  if (!raw) return
  try {
    const project = JSON.parse(raw)
    delete project.archived
    delete project.archivedAt
    saveProject(project)
    localStorage.removeItem(archiveProjectKey(id))
    const archiveIndex = listArchivedProjects().filter(s => s.id !== id)
    localStorage.setItem(ARCHIVE_INDEX_KEY, JSON.stringify(archiveIndex))
  } catch { /* ignore */ }
}

export function permanentDeleteProject(id: string): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(archiveProjectKey(id))
  const archiveIndex = listArchivedProjects().filter(s => s.id !== id)
  localStorage.setItem(ARCHIVE_INDEX_KEY, JSON.stringify(archiveIndex))
}

export function exportProjectJson(project: Project): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.title}-${project.id}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function exportInk(project: Project): void {
  const lines: string[] = []
  lines.push(`// ${project.title}`)
  lines.push(`// 由 filmgame 导出 · ${new Date().toLocaleDateString('zh-CN')}`)
  lines.push('')

  const inkVarName = (name: string): string => {
    const direct = name.replace(/[^a-zA-Z0-9_]/g, '_')
    const fixed = /^[0-9]/.test(direct) ? `var_${direct}` : direct
    if (!fixed || fixed === '_' || fixed.replace(/_/g, '') === '') {
      const hash = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
      return `var_${hash}`
    }
    return fixed
  }
  const applyInkEffects = (effects: string): string[] => {
    if (!effects.trim()) return []
    return effects.split(',').map(p => p.trim()).filter(Boolean).map(p => {
      if (p.startsWith('+')) return `~ ${inkVarName(p.slice(1))} = ${inkVarName(p.slice(1))} + 1`
      if (p.startsWith('-') && !p.includes('=')) return `~ ${inkVarName(p.slice(1))} = ${inkVarName(p.slice(1))} - 1`
      if (p.includes('=')) {
        const eq = p.indexOf('=')
        const name = inkVarName(p.slice(0, eq))
        const val = p.slice(eq + 1)
        return `~ ${name} = ${isNaN(Number(val)) ? `"${val}"` : val}`
      }
      return ''
    }).filter(Boolean)
  }

  if (project.variables.length > 0) {
    const mappings: string[] = []
    for (const v of project.variables) {
      const converted = inkVarName(v.name)
      if (converted !== v.name) mappings.push(`// 变量映射: ${converted} = "${v.name}"`)
      const val = isNaN(Number(v.defaultValue)) ? `"${v.defaultValue}"` : v.defaultValue
      lines.push(`VAR ${converted} = ${val}`)
    }
    if (mappings.length > 0) {
      lines.unshift('', ...mappings)
    }
    lines.push('')
  }

  const nodeMap = new Map(project.nodes.map(n => [n.id, n]))
  const startNode = project.nodes.find(n => n.type === 'start') ?? project.nodes[0]
  if (startNode) lines.push(`-> ${startNode.id}`)
  lines.push('')

  for (const node of project.nodes) {
    lines.push(`=== ${node.id} ===`)
    if (node.title) lines.push(`// ${node.title}`)
    if (node.sceneDesc) lines.push(`// [场景] ${node.sceneDesc}`)
    for (const line of node.dialogue) {
      if (line.speaker && line.text) lines.push(`${line.speaker}: ${line.text}`)
      else if (line.text) lines.push(line.text)
    }
    if (node.type === 'ending') {
      const ending = project.endings.find(e => e.nodeId === node.id)
      if (ending) lines.push(`// [结局: ${ending.title}] ${ending.description}`)
      lines.push('-> END')
    } else if (node.choices.length === 0) {
      lines.push('-> END')
    } else if (node.choices.length === 1 && node.type !== 'branch') {
      const c = node.choices[0]
      applyInkEffects(c.variableEffects).forEach(l => lines.push(l))
      lines.push(`-> ${c.targetNodeId || 'END'}`)
    } else {
      for (const choice of node.choices) {
        const target = nodeMap.get(choice.targetNodeId)
        const inkCond = conditionsToInk(choice.conditions ?? '')
        if (inkCond) {
          lines.push(`{ ${inkCond}:`)
          lines.push(`  + [${choice.text}]`)
          applyInkEffects(choice.variableEffects).forEach(l => lines.push(`    ${l}`))
          lines.push(`    -> ${target ? choice.targetNodeId : 'END'}`)
          lines.push(`}`)
        } else {
          lines.push(`+ [${choice.text}]`)
          applyInkEffects(choice.variableEffects).forEach(l => lines.push(`  ${l}`))
          lines.push(`  -> ${target ? choice.targetNodeId : 'END'}`)
        }
      }
    }
    lines.push('')
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.title}.ink`
  a.click()
  URL.revokeObjectURL(url)
}
