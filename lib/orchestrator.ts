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
import type { Retrieved } from './retrieve';

export type ClientMessage = {
  role: 'user' | 'assistant';
  content: string;
};

// 只保留最近若干轮进入上下文;更早的对话由"长期记忆"承载,不丢失。
const MAX_HISTORY = 24;

/**
 * 把检索到的技术卡片,拼成一段"内部方法参考"。
 * 关键:强约束模型把它消化成温柔的大白话,绝不引用、不报书名、不掉术语——
 * 这是 RAG 不变成"爹味"的命门。
 */
function methodReference(cards: Retrieved[]): string {
  if (cards.length === 0) return '';
  const body = cards
    .map((r) => `- 【${r.card.technique}】${r.card.guidance}`)
    .join('\n');
  return (
    `\n\n# 内部方法参考(仅供你参考,绝不要直接念给对方听)\n\n` +
    `根据对方此刻的话,以下方法可能用得上。请把它们消化成你自己温柔、口语的话,自然地融进对话——` +
    `绝不引用原文、不报方法名/书名、不堆术语、不说教。先共情,再(如果合适)轻轻用上其中的思路。` +
    `如果对方只是想倾诉,就忽略这些,好好听。\n\n${body}`
  );
}

export function buildMessages(
  history: ClientMessage[],
  memory = '',
  cards: Retrieved[] = [],
): ChatMessage[] {
  const trimmed = history.slice(-MAX_HISTORY);
  const system = withMemory(memory) + methodReference(cards);
  return [{ role: 'system', content: system }, ...trimmed];
}

export function lastUserText(history: ClientMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') return history[i].content;
  }
  return '';
}
