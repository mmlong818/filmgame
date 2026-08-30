'use client'
import { Button } from '@/app/components/ui/button'
import { SectionHeading } from './widgets'
import { CharacterCard } from './CharacterCard'
import type { Character, WorldAnchor } from '@/lib/types/project'

/** 主要角色（核心产出）。AI 生成入口在右侧辅助区。 */
export function CharactersPanel({ characters, worldAnchor, onAdd, onUpdate, onDelete }: {
  characters: Character[]
  worldAnchor: WorldAnchor
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<Character>) => void
  onDelete: (id: string) => void
}) {
  return (
    <div>
      <SectionHeading
        title="主要角色"
        action={<Button variant="ghost" size="sm" onClick={onAdd}>+ 添加角色</Button>}
      />
      {characters.length === 0 ? (
        <p className="text-xs text-pencil italic">尚无角色——手动添加，或使用右侧「AI 生成角色」</p>
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
