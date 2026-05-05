import { runChain } from './lc-chains'
import { FillEmotionSchema, WriteDialogueSchema, type FillEmotion, type WriteDialogue } from './schemas'

export interface EmotionTask {
  nodeId: string
  nodeContext: Record<string, unknown>
}

export interface DialogueTask {
  nodeId: string
  nodeContext: Record<string, unknown>
}

export async function runBatchFillEmotion(
  tasks: EmotionTask[]
): Promise<Array<{ nodeId: string; emotion: FillEmotion | null }>> {
  const results = await Promise.all(
    tasks.map(async (task) => {
      try {
        const result = await runChain({
          phase: 'workshop',
          action: 'fill_emotion',
          context: task.nodeContext,
          timeoutMs: 60000,
        })
        const parsed = FillEmotionSchema.safeParse(result)
        return { nodeId: task.nodeId, emotion: parsed.success ? parsed.data : null }
      } catch {
        return { nodeId: task.nodeId, emotion: null }
      }
    })
  )
  return results
}

export async function runBatchWriteDialogue(
  tasks: DialogueTask[]
): Promise<Array<{ nodeId: string; dialogue: WriteDialogue | null }>> {
  const results = await Promise.all(
    tasks.map(async (task) => {
      try {
        const result = await runChain({
          phase: 'workshop',
          action: 'write_dialogue',
          context: task.nodeContext,
          timeoutMs: 180000,
        })
        const parsed = WriteDialogueSchema.safeParse(result)
        return { nodeId: task.nodeId, dialogue: parsed.success ? parsed.data : null }
      } catch {
        return { nodeId: task.nodeId, dialogue: null }
      }
    })
  )
  return results
}
