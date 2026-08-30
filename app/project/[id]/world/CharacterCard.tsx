'use client'
import { useState } from 'react'
import { IndexCard } from '@/app/components/ui/index-card'
import { ConfirmButton } from '@/app/components/ui/confirm'
import { StickyNote } from '@/app/components/ui/sticky-note'
import { useAiAction } from '@/lib/hooks/useAiAction'
import { aiJson } from '@/lib/ai/client'
import { useToast } from '@/app/components/toast'
import { undo } from '@/lib/store/history'
import type { Character, VoiceProfile, WorldAnchor } from '@/lib/types/project'
import { AiTrigger, BufferedInput } from './ai-widgets'

interface Props {
  character: Character
  worldAnchor: WorldAnchor
  onUpdate: (patch: Partial<Character>) => void
  onDelete: () => void
}

/** 单个角色的索引卡：字段本地缓冲回写 + AI 声音指纹（自带独立的 loading/error/取消） */
export function CharacterCard({ character, worldAnchor, onUpdate, onDelete }: Props) {
  const { toast } = useToast()
  const voiceAi = useAiAction()
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | undefined>(character.voiceProfile)

  async function generateVoice() {
    const data = await voiceAi.run('AI 声音指纹', signal =>
      aiJson<{ result?: VoiceProfile }>('workshop', 'character_voice', { character, worldAnchor }, signal),
    )
    if (data?.result) {
      setVoiceProfile(data.result)
      onUpdate({ voiceProfile: data.result })
    }
  }

  return (
    <IndexCard className="space-y-2">
      <div className="flex items-center gap-2">
        <BufferedInput
          value={character.name}
          onCommit={v => onUpdate({ name: v })}
          placeholder="角色名"
          className="!w-28 shrink-0 font-medium"
        />
        <select
          value={character.role}
          onChange={e => onUpdate({ role: e.target.value as Character['role'] })}
          className="bg-paper border border-line px-2 py-1.5 text-xs text-ink focus:border-inkblue focus:outline-none cursor-pointer"
        >
          <option value="protagonist">主角</option>
          <option value="antagonist">对立角色</option>
          <option value="support">支线角色</option>
          <option value="other">其他</option>
        </select>
        <ConfirmButton
          size="sm"
          confirmLabel="确认删除"
          className="ml-auto"
          onConfirm={() => {
            onDelete()
            toast('已删除角色', 'success', { action: { label: '撤销', onClick: () => undo() } })
          }}
        >
          ✕
        </ConfirmButton>
      </div>
      <BufferedInput value={character.motivation} onCommit={v => onUpdate({ motivation: v })} placeholder="核心动机（想要什么？）" className="text-xs" />
      <BufferedInput value={character.relationship} onCommit={v => onUpdate({ relationship: v })} placeholder="与主线的关系" className="text-xs" />
      <div className="grid grid-cols-2 gap-1.5">
        <BufferedInput value={character.wound ?? ''} onCommit={v => onUpdate({ wound: v })} placeholder="心理伤痛 WOUND" className="text-xs" />
        <BufferedInput value={character.lie ?? ''} onCommit={v => onUpdate({ lie: v })} placeholder="内心谎言 LIE" className="text-xs" />
        <BufferedInput value={character.want ?? ''} onCommit={v => onUpdate({ want: v })} placeholder="外部欲望 WANT" className="text-xs" />
        <BufferedInput value={character.need ?? ''} onCommit={v => onUpdate({ need: v })} placeholder="内在需求 NEED" className="text-xs" />
      </div>
      <AiTrigger ai={voiceAi} label="AI 声音指纹" onRun={generateVoice} disabled={!character.motivation} size="sm" />
      {voiceProfile && (
        <StickyNote title="角色建议 · 声音指纹" tilt={-1}>
          <div><span className="opacity-70">节奏：</span>{voiceProfile.speaking_rhythm}</div>
          <div><span className="opacity-70">词汇：</span>{voiceProfile.vocabulary}</div>
          <div><span className="opacity-70">压力下：</span>{voiceProfile.defense_mechanism}</div>
          {voiceProfile.sample_lines && voiceProfile.sample_lines.length > 0 && (
            <div className="italic border-t border-[#4a3c14]/20 pt-1.5 mt-1.5">「{voiceProfile.sample_lines[0]}」</div>
          )}
        </StickyNote>
      )}
    </IndexCard>
  )
}
