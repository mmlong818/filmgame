'use client'
import { useState } from 'react'
import type { Project, StoryNode, Character } from '@/lib/types/project'
import type { AiActionState } from '@/lib/hooks/useAiAction'
import { AssistRail, AssistSection } from '@/app/components/ui/assist-rail'
import {
  inputClass,
  speakerColor,
  AiActionButton,
  AiErrorNote,
  BufferedInput,
  BufferedTextarea,
} from './widgets'
import {
  SceneAnalysisPanel,
  SceneTensionPanel,
  ChoiceConsequencePanel,
  ChoiceSuggestionsPanel,
} from './AIPanels'
import { ReviseDialogueControl } from './ReviseDialogueControl'
import { CharacterVoiceEntry } from './CharacterVoiceEntry'
import type { NodeDraft, SceneAnalysisResult, SceneTensionResult, ChoiceSuggestion, ChoiceConsequenceResult } from './types'

interface AiCollabProps {
  selected: StoryNode
  aiEmotion: AiActionState
  aiDialogue: AiActionState
  aiChoices: AiActionState
  aiSceneAnalysis: AiActionState
  aiSceneTension: AiActionState
  aiChoiceConsequence: AiActionState
  aiDesignNode: AiActionState
  aiReviseDialogue: AiActionState
  onFillEmotion: () => void
  onWriteDialogue: () => void
  onSuggestChoices: () => void
  onSceneAnalysis: () => void
  onSceneTension: () => void
  onDesignNode: () => void
  onReviseDialogue: (instruction: string) => void
  onChoiceConsequence: (choiceIndex: number) => void
  aiErrorEntries: { key: string; hook: AiActionState }[]
}

// AI 协作卡：8 个单节点 AI 动作集中一处，各自独立 loading/中止/错误。
function AiCollabCard(props: AiCollabProps) {
  const {
    selected, aiEmotion, aiDialogue, aiChoices, aiSceneAnalysis, aiSceneTension,
    aiChoiceConsequence, aiDesignNode, aiReviseDialogue,
    onFillEmotion, onWriteDialogue, onSuggestChoices, onSceneAnalysis, onSceneTension,
    onDesignNode, onReviseDialogue, onChoiceConsequence, aiErrorEntries,
  } = props
  const [choiceIdx, setChoiceIdx] = useState(0)
  const consequenceLoading = aiChoiceConsequence.loading === `choice_consequence:${choiceIdx}`

  return (
    <div className="bg-paper border border-line-soft p-3.5 space-y-3">
      {aiErrorEntries.length > 0 && (
        <div className="space-y-1.5">
          {aiErrorEntries.map(({ key, hook }) => (
            <AiErrorNote key={key} error={hook.error!} onRetry={hook.retry} onDismiss={hook.clearError} />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <AiActionButton label="AI 填写情感函数" loading={!!aiEmotion.loading} onRun={onFillEmotion} onCancel={aiEmotion.cancel} />
        <AiActionButton label="AI 生成对白" loading={!!aiDialogue.loading} onRun={onWriteDialogue} onCancel={aiDialogue.cancel} />
        <AiActionButton label="AI 建议选项" loading={!!aiChoices.loading} onRun={onSuggestChoices} onCancel={aiChoices.cancel} />
        <AiActionButton label="场景分析" tone="amberink" loading={!!aiSceneAnalysis.loading} onRun={onSceneAnalysis} onCancel={aiSceneAnalysis.cancel} />
        <AiActionButton label="⚡ 场景张力诊断" tone="inkblue" loading={!!aiSceneTension.loading} onRun={onSceneTension} onCancel={aiSceneTension.cancel} />
        <AiActionButton label="AI 设计此节点" tone="vermilion" loading={!!aiDesignNode.loading} onRun={onDesignNode} onCancel={aiDesignNode.cancel} />
      </div>

      {selected.dialogue.length > 0 && (
        <ReviseDialogueControl
          loading={!!aiReviseDialogue.loading}
          onSubmit={onReviseDialogue}
          onCancel={aiReviseDialogue.cancel}
        />
      )}

      {selected.choices.length > 0 && (
        <div className="flex items-center gap-1.5">
          <select
            value={choiceIdx}
            onChange={e => setChoiceIdx(Number(e.target.value))}
            className={`${inputClass} text-xs px-2 py-1.5 flex-1`}
          >
            {selected.choices.map((c, i) => (
              <option key={c.id} value={i}>{String.fromCharCode(65 + i)}. {c.text || '（无文字）'}</option>
            ))}
          </select>
          <AiActionButton
            label="🎯 推演后果"
            tone="vermilion"
            loading={consequenceLoading}
            onRun={() => onChoiceConsequence(choiceIdx)}
            onCancel={aiChoiceConsequence.cancel}
          />
        </div>
      )}
    </div>
  )
}

interface AiResultsProps {
  currentDraft: NodeDraft | null
  onCommitDraft: () => void
  onDiscardDraft: () => void
  onRegenerateDraft: () => void
  sceneAnalysis: SceneAnalysisResult | null
  onCloseSceneAnalysis: () => void
  sceneTension: SceneTensionResult | null
  sceneTensionOpen: boolean
  onToggleSceneTension: () => void
  onCloseSceneTension: () => void
  choiceConsequence: ChoiceConsequenceResult | null
  onCloseChoiceConsequence: () => void
  choiceSuggestions: ChoiceSuggestion[] | null
  onCloseChoiceSuggestions: () => void
}

// AI 生成的设计草稿预览：确认前不进入正文，通过/丢弃/重新生成都在这里完成。
function DraftPreview({ draft, onCommit, onDiscard, onRegenerate }: {
  draft: NodeDraft
  onCommit: () => void
  onDiscard: () => void
  onRegenerate: () => void
}) {
  return (
    <div className="bg-paper border border-vermilion/30 border-l-[3px] border-l-vermilion p-3.5" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-xs font-medium text-ink">AI 已生成设计方案</p>
        <div className="flex gap-1.5">
          <button type="button" onClick={onDiscard} className="cursor-pointer text-[11px] border border-line text-ink-soft px-2 py-0.5 hover:bg-paper-dim">丢弃</button>
          <button type="button" onClick={onRegenerate} className="cursor-pointer text-[11px] border border-line text-ink-soft px-2 py-0.5 hover:bg-paper-dim">重新生成</button>
          <button type="button" onClick={onCommit} className="cursor-pointer text-[11px] bg-vermilion text-paper px-2 py-0.5 hover:bg-vermilion-deep">通过</button>
        </div>
      </div>
      {draft.sceneDesc && (
        <div className="mb-2">
          <p className="text-[11px] font-medium text-ink-soft mb-1">场景描述预览</p>
          <p className="text-[11px] text-ink-soft bg-paper-dim p-2 leading-relaxed">{draft.sceneDesc}</p>
        </div>
      )}
      {draft.emotionFunction && (
        <div className="mb-2">
          <p className="text-[11px] font-medium text-ink-soft mb-1">情感函数预览</p>
          <div className="grid grid-cols-2 gap-1.5 text-[11px] text-ink-soft bg-paper-dim p-2">
            <span>进入：{draft.emotionFunction.emotionIn}</span>
            <span>离开：{draft.emotionFunction.emotionOut}</span>
            <span>玩家情感：{draft.emotionFunction.playerEmotion}</span>
            <span>紧张度：{draft.emotionFunction.tension}/10</span>
          </div>
        </div>
      )}
      {draft.dialogue && (
        <div>
          <p className="text-[11px] font-medium text-ink-soft mb-1">对白预览</p>
          <div className="space-y-1 bg-paper-dim p-2">
            {draft.dialogue.map((line, i) => (
              <div key={i} className="text-[11px] text-ink-soft">
                <span className="font-medium">{line.speaker}</span>
                <span className="text-pencil mx-1">·</span>
                <span>{line.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// AI 结果卡：草稿预览 + 四类分析便签，原本散落在正文里的都收进这里。
function AiResultsCard(props: AiResultsProps) {
  const {
    currentDraft, onCommitDraft, onDiscardDraft, onRegenerateDraft,
    sceneAnalysis, onCloseSceneAnalysis,
    sceneTension, sceneTensionOpen, onToggleSceneTension, onCloseSceneTension,
    choiceConsequence, onCloseChoiceConsequence,
    choiceSuggestions, onCloseChoiceSuggestions,
  } = props
  const hasAny = currentDraft || sceneAnalysis || sceneTension || choiceConsequence || choiceSuggestions
  if (!hasAny) return <p className="text-[11px] text-pencil italic">运行上方「AI 协作」中的动作后，结果会出现在这里</p>

  return (
    <div className="space-y-3">
      {currentDraft && (
        <DraftPreview draft={currentDraft} onCommit={onCommitDraft} onDiscard={onDiscardDraft} onRegenerate={onRegenerateDraft} />
      )}
      {sceneAnalysis && <SceneAnalysisPanel data={sceneAnalysis} onClose={onCloseSceneAnalysis} />}
      {sceneTension && (
        <SceneTensionPanel data={sceneTension} open={sceneTensionOpen} onToggle={onToggleSceneTension} onClose={onCloseSceneTension} />
      )}
      {choiceConsequence && <ChoiceConsequencePanel data={choiceConsequence} onClose={onCloseChoiceConsequence} />}
      {choiceSuggestions && <ChoiceSuggestionsPanel data={choiceSuggestions} onClose={onCloseChoiceSuggestions} />}
    </div>
  )
}

interface NodeParamsProps {
  project: Project
  selected: StoryNode
  updateNode: (nodeId: string, patch: Partial<StoryNode>) => void
  voiceOpenCharId: string | null
  voiceLoadingIds: Set<string>
  onToggleVoice: (charId: string) => void
  onGenerateVoice: (character: Character) => void
  onCloseVoice: () => void
}

// 出场角色参考卡：wound/lie/声纹——与情感函数、对白无关的"关于角色"参考信息，随节点参数一起收进辅助区。
function CastCard({ project, selected, voiceOpenCharId, voiceLoadingIds, onToggleVoice, onGenerateVoice, onCloseVoice }: NodeParamsProps) {
  if (project.characters.length === 0) return null
  const speakersInNode = [...new Set(selected.dialogue.map(d => d.speaker).filter(Boolean))]
  const relevantChars = project.characters.filter(c => speakersInNode.includes(c.name) || project.characters.length <= 3)
  if (relevantChars.length === 0) return null

  return (
    <div>
      <label className="text-xs text-pencil block mb-1.5">出场角色</label>
      <div className="space-y-1.5">
        {relevantChars.map(ch => (
          <div key={ch.id} className="bg-paper-dim border border-line-soft px-3 py-2">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-bold ${speakerColor(ch.name)}`}>{ch.name}</span>
              <span className="text-[10px] text-pencil">{ch.role}</span>
              {speakersInNode.includes(ch.name) && (
                <CharacterVoiceEntry
                  character={ch}
                  open={voiceOpenCharId === ch.id}
                  loading={voiceLoadingIds.has(ch.id)}
                  onToggle={() => onToggleVoice(ch.id)}
                  onGenerate={() => onGenerateVoice(ch)}
                  onClose={onCloseVoice}
                />
              )}
            </div>
            {ch.wound && <p className="text-[11px] text-ink-soft leading-snug"><span className="text-vermilion font-medium">伤痛：</span>{ch.wound}</p>}
            {ch.lie && <p className="text-[11px] text-ink-soft leading-snug"><span className="text-amberink font-medium">谎言：</span>{ch.lie}</p>}
            {ch.voiceProfile?.sample_lines && ch.voiceProfile.sample_lines.length > 0 && (
              <p className="text-[11px] text-pencil italic mt-0.5">&quot;{ch.voiceProfile.sample_lines[0]}&quot;</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// 探索节点设置：仅 explore 类型节点显示，配置"返回主线"目标——结构/系统性配置，不属于故事正文。
function ExploreSettings({ project, selected, updateNode }: NodeParamsProps) {
  if (selected.type !== 'explore') return null
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-inkblue bg-inkblue/10 border border-inkblue/20 px-3 py-2 leading-relaxed">
        探索节点是<strong>可选旁支内容</strong>——玩家自愿进入，看完后通过"返回主线"按钮回到主故事。
        它不占用主线选项，也不影响剧情走向，适合放置档案、日记、隐藏线索等内容。
      </p>
      <label className="text-xs text-pencil block">
        探索完成后返回的节点
        <span className="ml-1 text-pencil/80">（玩家点击"返回主线"后跳转到这里）</span>
      </label>
      {selected.exploreReturnNodeId ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-inkblue/10 border border-inkblue/30 px-3 py-2">
            <span className="text-xs text-inkblue">◎ 返回至：</span>
            <span className="text-sm font-medium text-ink">
              {project.nodes.find(n => n.id === selected.exploreReturnNodeId)?.title ?? '（节点已删除）'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => updateNode(selected.id, { exploreReturnNodeId: undefined })}
            className="cursor-pointer text-xs text-pencil hover:text-vermilion px-2 py-1 border border-line"
          >
            清除
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="text-xs text-vermilion bg-vermilion/10 border border-vermilion/20 px-3 py-2">
            ⚠ 未设置返回节点——玩家进入此探索节点后将无法返回主线
          </div>
          <select
            defaultValue=""
            onChange={e => { if (e.target.value) updateNode(selected.id, { exploreReturnNodeId: e.target.value }) }}
            className={`${inputClass} focus:border-inkblue`}
          >
            <option value="" disabled>选择返回目标节点…</option>
            {project.nodes
              .filter(n => n.id !== selected.id && n.type !== 'explore' && n.type !== 'ending')
              .map(n => <option key={n.id} value={n.id}>{n.title || '（无标题）'}</option>)
            }
          </select>
        </div>
      )}
    </div>
  )
}

// 节点参数卡：情感弧、预估时长、出场角色、备注——影响创作但不是"正文"的节点级配置。
function NodeParamsCard(props: NodeParamsProps) {
  const { selected, updateNode } = props
  const ef = selected.emotionFunction
  const estSeconds = Math.round(selected.dialogue.length * 18)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-pencil block mb-1">进入情绪</label>
          <BufferedInput value={ef?.emotionIn ?? ''} onCommit={v => updateNode(selected.id, { emotionFunction: { ...ef, emotionIn: v } })} className={inputClass} placeholder="例：焦虑" />
        </div>
        <div>
          <label className="text-xs text-pencil block mb-1">离开情绪</label>
          <BufferedInput value={ef?.emotionOut ?? ''} onCommit={v => updateNode(selected.id, { emotionFunction: { ...ef, emotionOut: v } })} className={inputClass} placeholder="例：震惊" />
        </div>
        <div>
          <label className="text-xs text-pencil block mb-1">玩家情感目标</label>
          <BufferedInput value={ef?.playerEmotion ?? ''} onCommit={v => updateNode(selected.id, { emotionFunction: { ...ef, playerEmotion: v } })} className={inputClass} placeholder="例：紧张期待" />
        </div>
        <div>
          <label className="text-xs text-pencil block mb-1">紧张度 ({ef?.tension ?? 0}/10)</label>
          <input type="range" min={0} max={10} value={ef?.tension ?? 0} onChange={e => updateNode(selected.id, { emotionFunction: { ...ef, tension: Number(e.target.value) } })} className="w-full mt-2 accent-vermilion" />
        </div>
        <div>
          <label className="text-xs text-pencil block mb-1">内在谎言</label>
          <BufferedInput value={ef?.internal_lie ?? ''} onCommit={v => updateNode(selected.id, { emotionFunction: { ...ef, internal_lie: v } })} className={inputClass} placeholder="角色此刻相信的错误信念" />
        </div>
        <div>
          <label className="text-xs text-pencil block mb-1">恐惧</label>
          <BufferedInput value={ef?.fear ?? ''} onCommit={v => updateNode(selected.id, { emotionFunction: { ...ef, fear: v } })} className={inputClass} placeholder="角色此刻的恐惧" />
        </div>
      </div>

      <div>
        <label className="text-xs text-pencil block mb-1">预估时长（秒）</label>
        <BufferedInput
          type="number"
          value={String(selected.durationSeconds ?? 0)}
          onCommit={v => updateNode(selected.id, { durationSeconds: Number(v) || 0 })}
          className={inputClass}
        />
        <p className="text-[11px] text-pencil mt-1">对白 {selected.dialogue.length} 行 · 按语速估算约 {estSeconds}s</p>
      </div>

      <CastCard {...props} />
      <ExploreSettings {...props} />

      <div>
        <label className="text-xs text-pencil block mb-1">设计备注</label>
        <BufferedTextarea
          key={selected.id}
          value={selected.notes}
          onCommit={v => updateNode(selected.id, { notes: v })}
          rows={3}
          className={inputClass}
          placeholder="节点的创作意图、技术要求、注意事项..."
        />
      </div>
    </div>
  )
}

// 系统功能卡：变量读写 + 触发条件——不属于故事正文的机制层配置。
function SystemFunctionCard({ project, selected, updateNode }: NodeParamsProps) {
  const sf = selected.systemFunction
  function toggle(list: string[], name: string) {
    return list.includes(name) ? list.filter(n => n !== name) : [...list, name]
  }
  if (project.variables.length === 0) {
    return <p className="text-[11px] text-pencil italic">项目尚未定义变量——在世界锚点页添加后可在此配置节点的读写</p>
  }
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-pencil block mb-1.5">读取变量</label>
        <div className="flex flex-wrap gap-1">
          {project.variables.map(v => (
            <button
              key={v.id}
              type="button"
              onClick={() => updateNode(selected.id, { systemFunction: { ...sf, variablesRead: toggle(sf.variablesRead, v.name) } })}
              className={`cursor-pointer text-[10px] px-2 py-0.5 border transition-colors ${
                sf.variablesRead.includes(v.name) ? 'bg-inkblue/10 border-inkblue/40 text-inkblue' : 'border-line text-pencil hover:border-inkblue/30'
              }`}
            >
              {v.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs text-pencil block mb-1.5">写入变量</label>
        <div className="flex flex-wrap gap-1">
          {project.variables.map(v => (
            <button
              key={v.id}
              type="button"
              onClick={() => updateNode(selected.id, { systemFunction: { ...sf, variablesWrite: toggle(sf.variablesWrite, v.name) } })}
              className={`cursor-pointer text-[10px] px-2 py-0.5 border transition-colors ${
                sf.variablesWrite.includes(v.name) ? 'bg-amberink/10 border-amberink/40 text-amberink' : 'border-line text-pencil hover:border-amberink/30'
              }`}
            >
              {v.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs text-pencil block mb-1">进入条件</label>
        <BufferedTextarea
          key={selected.id}
          value={sf.requirements}
          onCommit={v => updateNode(selected.id, { systemFunction: { ...sf, requirements: v } })}
          rows={2}
          className={inputClass}
          placeholder="进入此节点需要满足的变量条件，如：trust >= 3"
        />
      </div>
    </div>
  )
}

export interface NodeAssistRailProps extends AiCollabProps, AiResultsProps, NodeParamsProps {}

export function NodeAssistRail(props: NodeAssistRailProps) {
  return (
    <AssistRail>
      <AssistSection title="AI 协作">
        <AiCollabCard {...props} />
      </AssistSection>
      <AssistSection title="AI 结果">
        <AiResultsCard {...props} />
      </AssistSection>
      <AssistSection title="节点参数">
        <NodeParamsCard {...props} />
      </AssistSection>
      <AssistSection title="系统功能">
        <SystemFunctionCard {...props} />
      </AssistSection>
    </AssistRail>
  )
}
