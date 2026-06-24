/**
 * 检索:把用户当前的话向量化,在卡片索引里找最相关的几张技术卡。
 *
 * 全程"软失败":没 key、没索引、或网络出错 → 返回空,聊天照常进行,
 * 只是这次没有 RAG 增强。
 */

import { embed, cosine, hasEmbeddingKey } from './embeddings';
import { loadCards, loadIndex, type Card } from './corpus';

const TOP_K = 3;
const MIN_SCORE = 0.45; // 低于此相关度就不注入,避免硬塞无关方法

export type Retrieved = { card: Card; score: number };

export async function retrieve(query: string): Promise<Retrieved[]> {
  if (!query || !hasEmbeddingKey()) return [];

  const index = loadIndex();
  if (index.length === 0) return [];

  let qvec: number[];
  try {
    [qvec] = await embed([query]);
  } catch {
    return [];
  }
  if (!qvec) return [];

  const cards = loadCards();
  const byId = new Map(cards.map((c) => [c.id, c]));

  const scored: Retrieved[] = [];
  for (const entry of index) {
    const card = byId.get(entry.id);
    if (!card) continue;
    scored.push({ card, score: cosine(qvec, entry.vector) });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .filter((r) => r.score >= MIN_SCORE)
    .slice(0, TOP_K);
}
