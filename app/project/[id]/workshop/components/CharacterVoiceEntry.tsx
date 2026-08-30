'use client'
import type { Character } from '@/lib/types/project'
import { Spinner } from '@/app/components/ui/button'
import { StickyNote } from '@/app/components/ui/sticky-note'

interface Props {
  character: Character
  open: boolean
  loading: boolean
  onToggle: () => void
  onGenerate: () => void
  onClose: () => void
}

// 单个角色的声纹入口：已有声纹 -> 图标按钮弹出浮层卡片；没有 -> "生成声纹"按钮触发 AI。
// 浮层用 absolute 定位悬浮在按钮下方，不占用文档流、不遮挡对白编辑区主体。
export function CharacterVoiceEntry({ character, open, loading, onToggle, onGenerate, onClose }: Props) {
  const vp = character.voiceProfile

  return (
    <span className="relative inline-block">
      {vp ? (
        <button
          type="button"
          onClick={onToggle}
          title="查看声纹档案"
          className="cursor-pointer text-xs text-vermilion hover:text-vermilion-deep ml-1 align-middle"
        >
          🎙
        </button>
      ) : (
        <button
          type="button"
          onClick={onGenerate}
          disabled={loading}
          title="生成声纹档案"
          className="cursor-pointer text-[10px] text-pencil hover:text-vermilion ml-1 align-middle disabled:opacity-40 inline-flex items-center gap-1"
        >
          {loading && <Spinner />}
          + 生成声纹
        </button>
      )}

      {open && vp && (
        <div className="absolute z-30 top-full left-0 mt-1.5 w-72">
          <StickyNote tilt={-0.6}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold">{character.name} · 声纹档案</span>
              <button type="button" aria-label="关闭" onClick={onClose} className="cursor-pointer opacity-60 hover:opacity-100 leading-none">×</button>
            </div>
            <div className="space-y-1">
              {vp.speaking_rhythm && (
                <p><span className="font-medium">节奏：</span>{vp.speaking_rhythm}</p>
              )}
              {vp.vocabulary && (
                <p><span className="font-medium">词汇：</span>{vp.vocabulary}</p>
              )}
              {vp.defense_mechanism && (
                <p><span className="font-medium">压力下：</span>{vp.defense_mechanism}</p>
              )}
              {vp.lie_tells && (
                <p><span className="font-medium">说谎特征：</span>{vp.lie_tells}</p>
              )}
              {vp.sample_lines && vp.sample_lines.length > 0 && (
                <div className="italic border-t border-[#4a3c14]/15 pt-1.5 space-y-0.5">
                  {vp.sample_lines.slice(0, 2).map((l, i) => <p key={i}>「{l}」</p>)}
                </div>
              )}
            </div>
          </StickyNote>
        </div>
      )}
    </span>
  )
}
