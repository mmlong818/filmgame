'use client'
import { memo, useMemo } from 'react'
import type { Project } from '@/lib/types/project'
import { nodeTypeStyle } from '@/lib/ui/nodeTypes'
import { inputClass } from '@/app/components/ui/input'
import { DurationBar, CompletionBar, Completenessbadge, nodeCompleteness } from './widgets'

interface Props {
  project: Project
  nodeSearch: string
  onSearchChange: (v: string) => void
  selectedId: string | null
  onSelectNode: (id: string) => void
  hasDraft: (nodeId: string) => boolean
  onAddNode: (actId: string) => void
}

function NodeTreeSidebarImpl({
  project,
  nodeSearch,
  onSearchChange,
  selectedId,
  onSelectNode,
  hasDraft,
  onAddNode,
}: Props) {
  const { nodes, acts, chapters, characters, variables } = project

  // 树结构 + 搜索过滤：依赖精确到 nodes/acts/chapters/nodeSearch，不受 characters/variables 等无关字段变化影响。
  const chapterTree = useMemo(() => {
    return [...chapters].sort((a, b) => a.order - b.order).map(ch => {
      const chActs = acts.filter(a => a.chapterId === ch.id).sort((a, b) => a.order - b.order)
      return {
        chapter: ch,
        acts: chActs.map(act => {
          const actNodes = nodes.filter(n => {
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
            return { node, matchedSnippet }
          })
          return { act, nodes: actNodes }
        }),
      }
    })
  }, [nodes, acts, chapters, nodeSearch])

  // 角色弧线扫描：O(nodes×characters)，只依赖 nodes/characters，搜索框打字（改 nodeSearch）不应触发重算。
  const arcs = useMemo(() => {
    return characters.map(ch => ({
      ch,
      nodes: nodes.filter(n => n.dialogue.some(d => d.speaker === ch.name)),
    })).filter(({ nodes }) => nodes.length > 0)
  }, [nodes, characters])

  // 变量索引扫描：O(nodes×variables)，只依赖 nodes/variables。
  const varUsage = useMemo(() => {
    return variables.map(v => {
      const readNodes = nodes.filter(n => n.systemFunction.variablesRead.includes(v.name))
      const writeNodes = nodes.filter(n => n.systemFunction.variablesWrite.includes(v.name))
      const effectNodes = nodes.filter(n => n.choices.some(c => c.variableEffects.includes(v.name)))
      const total = new Set([...readNodes.map(n => n.id), ...writeNodes.map(n => n.id), ...effectNodes.map(n => n.id)]).size
      return { v, readNodes, writeNodes, effectNodes, total }
    }).filter(({ total }) => total > 0)
  }, [nodes, variables])

  return (
    <div className="w-72 border-r border-line overflow-y-auto flex-shrink-0">
      <div className="p-3 border-b border-line-soft space-y-2">
        <input
          value={nodeSearch}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="搜索节点…"
          className={`${inputClass} text-xs px-2.5 py-1.5`}
        />
        <DurationBar nodes={nodes} target={project.worldAnchor?.durationMinutes ?? 90} />
        <CompletionBar nodes={nodes} />
      </div>
      <div className="p-2.5 pt-3">
        {chapterTree.map(({ chapter: ch, acts: chActs }) => (
          <div key={ch.id} className="mb-3.5">
            <span className="tape-label text-[11px] tracking-wide text-ink-soft mb-1.5 ml-1">{ch.title}</span>
            {chActs.map(({ act, nodes: actNodes }) => (
              <div key={act.id} className="mb-1 mt-2">
                <p className="text-[11px] text-pencil px-1.5 py-0.5">{act.title}</p>
                {actNodes.map(({ node, matchedSnippet }) => {
                  const current = selectedId === node.id
                  const style = nodeTypeStyle(node.type)
                  return (
                    <div
                      key={node.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectNode(node.id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectNode(node.id) } }}
                      className={`relative cursor-pointer bg-paper border px-2.5 py-1.5 text-xs mb-1.5 flex items-center gap-1.5 ${
                        current ? 'border-vermilion/50' : 'border-line/70 hover:bg-paper-dim'
                      }`}
                      style={{ boxShadow: current ? 'var(--shadow-card-lift)' : 'var(--shadow-card)' }}
                    >
                      {current && <span aria-hidden className="pin pin-red" />}
                      <span className={`text-[10px] font-medium w-8 shrink-0 ${style.text}`}>{style.label}</span>
                      <span className={`flex-1 text-left leading-snug min-w-0 ${current ? 'font-medium text-ink' : 'text-ink-soft'}`}>
                        <span className="break-words line-clamp-2 block">{node.title}</span>
                        {matchedSnippet && (
                          <span className="block text-pencil italic mt-0.5">「{matchedSnippet}」</span>
                        )}
                      </span>
                      {hasDraft(node.id) && <span className="w-1.5 h-1.5 rounded-full bg-sticky flex-shrink-0" />}
                      <Completenessbadge score={nodeCompleteness(node)} />
                    </div>
                  )
                })}
                <button
                  type="button"
                  onClick={() => onAddNode(act.id)}
                  className="cursor-pointer w-full text-left px-2 py-1 text-xs text-pencil hover:text-vermilion transition-colors mt-0.5"
                >
                  + 添加节点
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {characters.length > 0 && (
        <div className="border-t border-line-soft p-3">
          <p className="text-xs font-medium text-pencil uppercase tracking-wide mb-2">角色速查</p>
          <div className="space-y-2">
            {characters.map(ch => (
              <div key={ch.id} className="text-xs">
                <span className="font-medium text-ink">{ch.name}</span>
                <span className="text-pencil ml-1">·</span>
                <span className="text-ink-soft ml-1">{ch.motivation || '动机未填'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {arcs.length > 0 && (
        <div className="border-t border-line-soft p-3">
          <p className="text-xs font-medium text-pencil uppercase tracking-wide mb-2">角色弧线</p>
          <div className="space-y-2.5">
            {arcs.map(({ ch, nodes: arcNodes }) => (
              <div key={ch.id}>
                <p className="text-xs font-medium text-ink-soft mb-1">
                  {ch.name} <span className="text-pencil font-normal">· {arcNodes.length}节点</span>
                </p>
                <div className="flex flex-wrap gap-1">
                  {arcNodes.map(n => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => onSelectNode(n.id)}
                      className="cursor-pointer text-[10px] px-1.5 py-0.5 border border-line text-ink-soft hover:border-vermilion/40 hover:text-vermilion transition-colors"
                    >
                      {n.title || '无标题'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {varUsage.length > 0 && (
        <div className="border-t border-line-soft p-3">
          <p className="text-xs font-medium text-pencil uppercase tracking-wide mb-2">变量索引</p>
          <div className="space-y-2.5">
            {varUsage.map(({ v, readNodes, writeNodes, effectNodes }) => (
              <div key={v.id}>
                <p className="text-xs font-medium text-ink-soft mb-1">
                  {v.name}
                  <span className="text-pencil font-normal ml-1">({v.type})</span>
                </p>
                <div className="space-y-1">
                  {readNodes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-inkblue w-6 shrink-0">读</span>
                      {readNodes.map(n => (
                        <button key={n.id} type="button" onClick={() => onSelectNode(n.id)}
                          className="cursor-pointer text-[10px] px-1.5 py-0.5 border border-inkblue/30 text-inkblue hover:bg-inkblue/10 transition-colors">{n.title || '无标题'}</button>
                      ))}
                    </div>
                  )}
                  {writeNodes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-amberink w-6 shrink-0">写</span>
                      {writeNodes.map(n => (
                        <button key={n.id} type="button" onClick={() => onSelectNode(n.id)}
                          className="cursor-pointer text-[10px] px-1.5 py-0.5 border border-amberink/30 text-amberink hover:bg-amberink/10 transition-colors">{n.title || '无标题'}</button>
                      ))}
                    </div>
                  )}
                  {effectNodes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-vermilion w-6 shrink-0">效</span>
                      {effectNodes.map(n => (
                        <button key={n.id} type="button" onClick={() => onSelectNode(n.id)}
                          className="cursor-pointer text-[10px] px-1.5 py-0.5 border border-vermilion/30 text-vermilion hover:bg-vermilion/10 transition-colors">{n.title || '无标题'}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export const NodeTreeSidebar = memo(NodeTreeSidebarImpl)
