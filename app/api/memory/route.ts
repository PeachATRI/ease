/**
 * 长期记忆接口。
 *
 * 这是"不止 1M 上下文"的关键:当对话变长,前端把较早的对话连同
 * 已有记忆发到这里,由模型压缩成一段简短、持久、以人为本的"记忆笔记"。
 * 之后每次聊天都会把这段记忆注入系统提示词——于是早已滑出上下文窗口的
 * 细节,依然"记得"。
 *
 * 当前记忆存放在前端 localStorage(单人本地可用);未来接账号后迁到加密的
 * 服务端存储。
 */

import { NextRequest } from 'next/server';
import { MEMORY_SYSTEM_PROMPT } from '@/lib/prompts';
import { complete, hasApiKey } from '@/lib/deepseek';
import type { ClientMessage } from '@/lib/orchestrator';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let messages: ClientMessage[] = [];
  let prevMemory = '';
  try {
    const body = await req.json();
    messages = Array.isArray(body?.messages) ? body.messages : [];
    prevMemory = typeof body?.memory === 'string' ? body.memory : '';
  } catch {
    return Response.json({ error: '请求格式有误' }, { status: 400 });
  }

  if (!hasApiKey() || messages.length === 0) {
    // 没 Key 时不更新记忆,原样返回
    return Response.json({ memory: prevMemory });
  }

  const transcript = messages
    .map((m) => `${m.role === 'user' ? '对方' : '我'}：${m.content}`)
    .join('\n');

  const input =
    (prevMemory ? `【已有的旧记忆】\n${prevMemory}\n\n` : '') +
    `【这一段对话】\n${transcript}`;

  try {
    const memory = await complete([
      { role: 'system', content: MEMORY_SYSTEM_PROMPT },
      { role: 'user', content: input },
    ]);
    return Response.json({ memory: memory.trim() || prevMemory });
  } catch {
    // 压缩失败不影响主流程,保留旧记忆
    return Response.json({ memory: prevMemory });
  }
}
