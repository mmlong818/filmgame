'use client'
import type { Project } from '@/lib/types/project'
import { DurationBar, CompletionBar, NodeTypeBadge, Completenessbadge, nodeCompleteness } from './widgets'

interface Props {
  project: Project
  nodeSearch: string
  onSearchChange: (v: string) => void
  selectedId: string | null
  onSelectNode: (id: string) => void
  hasDraft: (nodeId: string) => boolean
  onAddNode: (actId: string) => void
}

export function NodeTreeSidebar({
  project,
  nodeSearch,
  onSearchChange,
  selectedId,
  onSelectNode,
  hasDraft,
  onAddNode,
}: Props) {
  return (
    <div className="w-72 bg-white border-r border-zinc-200 overflow-y-auto flex-shrink-0">
      <div className="p-3 border-b border-gray-100 space-y-2">
        <input
          value={nodeSearch}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="搜索节点…"
          className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
        />
        <DurationBar nodes={project.nodes} target={project.worldAnchor?.durationMinutes ?? 90} />
        <CompletionBar nodes={project.nodes} />
      </div>
      <div className="p-2">
        {project.chapters.sort((a, b) => a.order - b.order).map(ch => {
          const chActs = project.acts.filter(a => a.chapterId === ch.id)
          return (
            <div key={ch.id} className="mb-3">
              <p className="text-xs font-semibold text-gray-500 px-2 py-1.5 border-b border-gray-100 mb-1">{ch.title}</p>
              {chActs.sort((a, b) => a.order - b.order).map(act => (
                <div key={act.id} className="mb-1">
                  <p className="text-xs text-gray-400 px-2 py-0.5">{act.title}</p>
                  {project.nodes.filter(n => {
                    if (!act.nodeIds.includes(n.id)) return false
                    if (!nodeSearch) return true
                    if (n.title.includes(nodeSearch)) return true
                    if (n.notes.includes(nodeSearch)) return true
                    if ((n.sceneDesc ?? '').includes(nodeSearch)) return true
                    if (n.dialogue.some(d => d.text.includes(nodeSearch) || d.speaker.includes(nodeSearch))) return true
                    return false
                  }).map(node => {
                    const matchedLine = nodeSearch && !node.title.includes(nodeSearch)
                      ? node.dialogue.find(d => d.text.includes(nodeSearch))
                      : null
                    const matchedSnippet = matchedLine
                      ? matchedLine.text.slice(0, 40) + (matchedLine.text.length > 40 ? '…' : '')
                      : null
                    return (
                      <button
                        key={node.id}
                        onClick={() => onSelectNode(node.id)}
                        className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors mb-0.5 flex items-center gap-1.5 ${selectedId === node.id ? 'bg-amber-50 text-amber-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                      >
                        <NodeTypeBadge type={node.type} />
                        <span className="flex-1 text-left leading-snug min-w-0">
                          <span className="break-words line-clamp-2 block">{node.title}</span>
                          {matchedSnippet && (
                            <span className="block text-gray-400 italic mt-0.5">「{matchedSnippet}」</span>
                          )}
                        </span>
                        {hasDraft(node.id) && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                        <Completenessbadge score={nodeCompleteness(node)} />
                      </button>
                    )
                  })}
                  <button
                    onClick={() => onAddNode(act.id)}
                    className="w-full text-left px-2 py-1 rounded text-xs text-gray-300 hover:text-amber-500 hover:bg-amber-50 transition-colors mt-0.5"
                  >
                    + 添加节点
                  </button>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {project.characters.length > 0 && (
        <div className="border-t border-gray-100 p-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">角色速查</p>
          <div className="space-y-2">
            {project.characters.map(ch => (
              <div key={ch.id} className="text-xs">
                <span className="font-medium text-gray-700">{ch.name}</span>
                <span className="text-gray-400 ml-1">·</span>
                <span className="text-gray-500 ml-1">{ch.motivation || '动机未填'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {project.characters.length > 0 && (() => {
        const arcs = project.characters.map(ch => ({
          ch,
          nodes: project.nodes.filter(n => n.dialogue.some(d => d.speaker === ch.name)),
        })).filter(({ nodes }) => nodes.length > 0)
        if (arcs.length === 0) return null
        return (
          <div className="border-t border-gray-100 p-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">角色弧线</p>
            <div className="space-y-2.5">
              {arcs.map(({ ch, nodes }) => (
                <div key={ch.id}>
                  <p className="text-xs font-medium text-gray-600 mb-1">
                    {ch.name} <span className="text-gray-400 font-normal">· {nodes.length}节点</span>
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {nodes.map(n => (
                      <button
                        key={n.id}
                        onClick={() => onSelectNode(n.id)}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-gray-100 text-gray-500 hover:border-amber-200 hover:text-amber-600 transition-colors"
                      >
                        {n.title || '无标题'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {project.variables.length > 0 && (() => {
        const varUsage = project.variables.map(v => {
          const readNodes = project.nodes.filter(n => n.systemFunction.variablesRead.includes(v.name))
          const writeNodes = project.nodes.filter(n => n.systemFunction.variablesWrite.includes(v.name))
          const effectNodes = project.nodes.filter(n => n.choices.some(c => c.variableEffects.includes(v.name)))
          const total = new Set([...readNodes.map(n => n.id), ...writeNodes.map(n => n.id), ...effectNodes.map(n => n.id)]).size
          return { v, readNodes, writeNodes, effectNodes, total }
        }).filter(({ total }) => total > 0)
        if (varUsage.length === 0) return null
        return (
          <div className="border-t border-gray-100 p-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">变量索引</p>
            <div className="space-y-2.5">
              {varUsage.map(({ v, readNodes, writeNodes, effectNodes }) => (
                <div key={v.id}>
                  <p className="text-xs font-medium text-gray-600 mb-1">
                    {v.name}
                    <span className="text-gray-400 font-normal ml-1">({v.type})</span>
                  </p>
                  <div className="space-y-1">
                    {readNodes.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-blue-500 w-6 shrink-0">读</span>
                        {readNodes.map(n => (
                          <button key={n.id} onClick={() => onSelectNode(n.id)}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-blue-100 text-blue-600 hover:bg-blue-50 transition-colors">{n.title || '无标题'}</button>
                        ))}
                      </div>
                    )}
                    {writeNodes.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-amber-500 w-6 shrink-0">写</span>
                        {writeNodes.map(n => (
                          <button key={n.id} onClick={() => onSelectNode(n.id)}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-amber-100 text-amber-600 hover:bg-amber-50 transition-colors">{n.title || '无标题'}</button>
                        ))}
                      </div>
                    )}
                    {effectNodes.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-rose-500 w-6 shrink-0">效</span>
                        {effectNodes.map(n => (
                          <button key={n.id} onClick={() => onSelectNode(n.id)}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-rose-100 text-rose-600 hover:bg-rose-50 transition-colors">{n.title || '无标题'}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
