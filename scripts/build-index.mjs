/**
 * 构建向量索引:把 data/corpus.json 的每张卡片向量化,写入 data/corpus-index.json。
 *
 * 用法(在本地、配好 SILICONFLOW_API_KEY 后):
 *   npm run build:index
 *
 * 之所以离线预先生成:运行时只需向量化"用户当前这一句",卡片向量已就绪。
 * (这个脚本会自己读取 .env.local,无需额外依赖。)
 */

import fs from 'node:fs';
import path from 'node:path';

// --- 极简 .env.local 读取(无需 dotenv 依赖) ---
function loadEnv() {
  const p = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const BASE_URL = process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1';
const MODEL = process.env.EMBEDDING_MODEL || 'BAAI/bge-m3';
const KEY = process.env.SILICONFLOW_API_KEY;

if (!KEY) {
  console.error('✗ 缺少 SILICONFLOW_API_KEY(请在 .env.local 配置)');
  process.exit(1);
}

function cardEmbedText(c) {
  return `状态:${c.state}。技术:${c.technique}。适用:${c.cues.join('、')}。${c.guidance}`;
}

async function embed(input) {
  const res = await fetch(`${BASE_URL}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, input }),
  });
  if (!res.ok) throw new Error(`Embedding 失败 (${res.status}): ${await res.text()}`);
  const json = await res.json();
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

async function main() {
  const cards = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/corpus.json'), 'utf-8'));
  console.log(`→ 共 ${cards.length} 张卡片,开始向量化(模型 ${MODEL})…`);

  const index = [];
  const BATCH = 16;
  for (let i = 0; i < cards.length; i += BATCH) {
    const batch = cards.slice(i, i + BATCH);
    const vectors = await embed(batch.map(cardEmbedText));
    batch.forEach((c, j) => index.push({ id: c.id, vector: vectors[j] }));
    console.log(`  …${Math.min(i + BATCH, cards.length)}/${cards.length}`);
  }

  const out = path.join(process.cwd(), 'data/corpus-index.json');
  fs.writeFileSync(out, JSON.stringify(index));
  console.log(`✓ 索引已写入 ${out}(维度 ${index[0]?.vector.length}）`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
