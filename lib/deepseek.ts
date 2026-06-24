/**
 * DeepSeek 客户端。DeepSeek 提供 OpenAI 兼容接口。
 * 这里封装一个「流式」调用,把模型逐字吐出的内容转成纯文本流,
 * 交给路由层直接回传给前端,实现打字机式的温柔显示。
 */

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

export function hasApiKey(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

/**
 * 调用 DeepSeek,返回一个纯文本(token 增量)的 ReadableStream。
 */
export async function streamChat(messages: ChatMessage[]): Promise<ReadableStream<Uint8Array>> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY 未配置');
  }

  const upstream = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: true,
      temperature: 1.0, // 偏高一点,让回应更有人味、不机械
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    throw new Error(`DeepSeek 请求失败 (${upstream.status}): ${detail}`);
  }

  // 把 DeepSeek 的 SSE 流解析成纯文本增量
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // 最后一段可能不完整,留到下次

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          controller.close();
          return;
        }
        try {
          const json = JSON.parse(data);
          const delta: string | undefined = json?.choices?.[0]?.delta?.content;
          if (delta) controller.enqueue(encoder.encode(delta));
        } catch {
          // 不完整的 JSON 片段,忽略
        }
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}

/**
 * 没有配置 API Key 时的占位回应,让界面与流程能先跑起来。
 */
export function mockStream(): ReadableStream<Uint8Array> {
  const text =
    '(这是占位回应——还没配置 DeepSeek API Key)\n\n' +
    '我在这儿,也在认真听。等你在 .env.local 里填上 DEEPSEEK_API_KEY,我就能真正陪你聊了。\n\n' +
    '在那之前,你也可以先把想说的打出来,感受一下这个空间。';
  const encoder = new TextEncoder();
  const chars = Array.from(text);
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      if (i >= chars.length) {
        controller.close();
        return;
      }
      // 一次吐几个字,模拟打字机
      const chunk = chars.slice(i, i + 2).join('');
      i += 2;
      controller.enqueue(encoder.encode(chunk));
      await new Promise((r) => setTimeout(r, 24));
    },
  });
}
