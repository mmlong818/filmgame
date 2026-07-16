'use client'
import type { Character } from '@/lib/types/project'

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
          className="text-xs text-amber-500 hover:text-amber-600 ml-1 align-middle"
        >
          🎙
        </button>
      ) : (
        <button
          type="button"
          onClick={onGenerate}
          disabled={loading}
          title="生成声纹档案"
          className="text-[10px] text-gray-300 hover:text-amber-500 ml-1 align-middle disabled:opacity-40 inline-flex items-center gap-1"
        >
          {loading && <span className="w-2 h-2 border border-amber-400 border-t-transparent rounded-full animate-spin inline-block" />}
          + 生成声纹
        </button>
      )}

      {open && vp && (
        <div className="absolute z-30 top-full left-0 mt-1.5 w-72 bg-amber-50 border border-amber-200 rounded-xl shadow-lg p-3 space-y-1.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-amber-700">{character.name} · 声纹档案</span>
            <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
          </div>
          {vp.speaking_rhythm && (
            <p className="text-[11px] text-amber-800 leading-relaxed"><span className="font-medium">节奏：</span>{vp.speaking_rhythm}</p>
          )}
          {vp.vocabulary && (
            <p className="text-[11px] text-amber-800 leading-relaxed"><span className="font-medium">词汇：</span>{vp.vocabulary}</p>
          )}
          {vp.defense_mechanism && (
            <p className="text-[11px] text-amber-800 leading-relaxed"><span className="font-medium">压力下：</span>{vp.defense_mechanism}</p>
          )}
          {vp.lie_tells && (
            <p className="text-[11px] text-amber-800 leading-relaxed"><span className="font-medium">说谎特征：</span>{vp.lie_tells}</p>
          )}
          {vp.sample_lines && vp.sample_lines.length > 0 && (
            <div className="text-[11px] text-amber-700 italic border-t border-amber-100 pt-1.5 space-y-0.5">
              {vp.sample_lines.slice(0, 2).map((l, i) => <p key={i}>「{l}」</p>)}
            </div>
          )}
        </div>
      )}
    </span>
  )
}
