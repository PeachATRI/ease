/**
 * 编排层:把一次对话请求,组装成发给模型的完整消息序列。
 *
 * 当前是「单段式」——用一段强系统提示词,让模型在内部完成
 * 状态识别 → 选档 → 选方法。这样行为集中、好调。
 *
 * 安全检查在路由层先于此处发生(见 api/chat/route.ts)。
 * 未来要做「两段式」(先用一次调用分类,再据此定制提示词)时,
 * 分类结果可以在这里拼进 system 提示词。
 */

import { withMemory } from './prompts';
import type { ChatMessage } from './deepseek';

export type ClientMessage = {
  role: 'user' | 'assistant';
  content: string;
};

// 只保留最近若干轮进入上下文;更早的对话由"长期记忆"承载,不丢失。
const MAX_HISTORY = 24;

export function buildMessages(history: ClientMessage[], memory = ''): ChatMessage[] {
  const trimmed = history.slice(-MAX_HISTORY);
  return [{ role: 'system', content: withMemory(memory) }, ...trimmed];
}

export function lastUserText(history: ClientMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') return history[i].content;
  }
  return '';
}
