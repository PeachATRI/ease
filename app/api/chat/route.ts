/**
 * 聊天接口。流程:
 *   1. 取出对话历史 → 找到最后一句用户的话
 *   2. 安全线:危机检测命中 → 直接回确定性的危机回应(不走模型)
 *   3. 否则组装消息 → 调用 DeepSeek 流式回应(无 Key 时回占位流)
 *
 * 全程以纯文本流返回,前端逐字渲染。
 */

import { NextRequest } from 'next/server';
import { detectCrisis, CRISIS_RESPONSE } from '@/lib/safety';
import { buildMessages, lastUserText, type ClientMessage } from '@/lib/orchestrator';
import { streamChat, mockStream, hasApiKey } from '@/lib/deepseek';
import { retrieve } from '@/lib/retrieve';

export const runtime = 'nodejs';

function textStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chars = Array.from(text);
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      if (i >= chars.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chars.slice(i, i + 2).join('')));
      i += 2;
      await new Promise((r) => setTimeout(r, 18));
    },
  });
}

const STREAM_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
};

export async function POST(req: NextRequest) {
  let history: ClientMessage[] = [];
  let memory = '';
  let tracker = '';
  try {
    const body = await req.json();
    history = Array.isArray(body?.messages) ? body.messages : [];
    memory = typeof body?.memory === 'string' ? body.memory : '';
    tracker = typeof body?.tracker === 'string' ? body.tracker : '';
  } catch {
    return new Response('请求格式有误', { status: 400 });
  }

  // 安全线优先
  const userText = lastUserText(history);
  if (detectCrisis(userText)) {
    return new Response(textStream(CRISIS_RESPONSE), { headers: STREAM_HEADERS });
  }

  try {
    if (!hasApiKey()) {
      return new Response(mockStream(), { headers: STREAM_HEADERS });
    }
    // RAG:检索相关技术卡片(软失败,失败则无增强照常聊)
    const cards = await retrieve(userText);
    const messages = buildMessages(history, memory, cards, tracker);
    const stream = await streamChat(messages);
    return new Response(stream, { headers: STREAM_HEADERS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '出了点问题';
    return new Response(
      textStream(`抱歉,我这边出了点状况,没能接上。\n\n(${msg})\n\n你愿意再说一次吗?`),
      { headers: STREAM_HEADERS },
    );
  }
}
