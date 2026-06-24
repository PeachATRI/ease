/**
 * 向量化客户端。用 SiliconFlow(硅基流动)的 BGE-M3 ——中文效果好、
 * OpenAI 兼容、国内可直连,和 DeepSeek 搭配顺手。
 *
 * 没配 SILICONFLOW_API_KEY 时,embed() 抛错,调用方会优雅降级(关闭 RAG)。
 */

const BASE_URL = process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1';
const MODEL = process.env.EMBEDDING_MODEL || 'BAAI/bge-m3';

export function hasEmbeddingKey(): boolean {
  return Boolean(process.env.SILICONFLOW_API_KEY);
}

export async function embed(input: string[]): Promise<number[][]> {
  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) throw new Error('SILICONFLOW_API_KEY 未配置');

  const res = await fetch(`${BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: MODEL, input }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Embedding 请求失败 (${res.status}): ${detail}`);
  }
  const json = await res.json();
  const data: Array<{ embedding: number[]; index: number }> = json?.data ?? [];
  // 按 index 排序,确保与输入顺序一致
  return data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
