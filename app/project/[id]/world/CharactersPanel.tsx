'use client'
import { Button } from '@/app/components/ui/button'
import { AiTrigger } from './ai-widgets'
import { SectionHeading } from './widgets'
import { CharacterCard } from './CharacterCard'
import type { AiActionState } from '@/lib/hooks/useAiAction'
import type { Character, WorldAnchor } from '@/lib/types/project'

export function CharactersPanel({ characters, worldAnchor, ai, onGenerate, onAdd, onUpdate, onDelete, disabled }: {
  characters: Character[]
  worldAnchor: WorldAnchor
  ai: AiActionState
  onGenerate: () => void
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<Character>) => void
  onDelete: (id: string) => void
  disabled: boolean
}) {
  return (
    <div>
      <SectionHeading
        title="主要角色"
        action={
          <div className="flex items-center gap-3">
            <AiTrigger ai={ai} label="AI 生成" onRun={onGenerate} disabled={disabled} size="sm" variant="ghost" />
            <Button variant="ghost" size="sm" onClick={onAdd}>+ 手动添加</Button>
          </div>
        }
      />
      {characters.length === 0 ? (
        <p className="text-xs text-pencil italic">点击「AI 生成」根据世界设定自动创建主要角色</p>
      ) : (
        <div className="space-y-2">
          {characters.map(ch => (
            <CharacterCard
              key={ch.id}
              character={ch}
              worldAnchor={worldAnchor}
              onUpdate={patch => onUpdate(ch.id, patch)}
              onDelete={() => onDelete(ch.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
