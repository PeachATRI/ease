/**
 * 语料库加载与表示。
 * 卡片数据在 data/corpus.json,向量索引(需本地 `npm run build:index` 生成)在
 * data/corpus-index.json。
 */

import fs from 'node:fs';
import path from 'node:path';

export type Card = {
  id: string;
  state: string;
  technique: string;
  source: string;
  cues: string[];
  guidance: string;
};

let _cards: Card[] | null = null;

export function loadCards(): Card[] {
  if (_cards) return _cards;
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'data/corpus.json'), 'utf-8');
    _cards = JSON.parse(raw) as Card[];
  } catch {
    _cards = [];
  }
  return _cards;
}

/** 用于向量化的文本表示——把状态、技术、触发线索、要点拼在一起。 */
export function cardEmbedText(c: Card): string {
  return `状态:${c.state}。技术:${c.technique}。适用:${c.cues.join('、')}。${c.guidance}`;
}

export type IndexEntry = { id: string; vector: number[] };

let _index: IndexEntry[] | null = null;

export function loadIndex(): IndexEntry[] {
  if (_index) return _index;
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'data/corpus-index.json'), 'utf-8');
    _index = JSON.parse(raw) as IndexEntry[];
  } catch {
    _index = []; // 没生成索引时,RAG 自动关闭
  }
  return _index;
}
