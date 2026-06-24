/**
 * 打卡 / 小步 / 习惯 的客户端逻辑(存 localStorage)。
 *
 * 设计底线(防爹味、防自作聪明):
 * - 庆祝"努力"和"愿意",不只看结果。
 * - 漏打卡绝不指责、不计较、不施压。
 * - 不做攀比式游戏化;连续天数只是温柔地看见,不是 KPI。
 *
 * 仅在客户端使用(依赖 localStorage)。
 */

export type TrackerItem = {
  id: string;
  title: string;
  type: 'step' | 'habit'; // 小步=一次性的小目标;习惯=想慢慢养成的
  createdAt: string; // YYYY-MM-DD
  history: string[]; // 打卡日期 YYYY-MM-DD
  done?: boolean; // 小步:已完成
};

const KEY = 'ease.tracker.v1';

export function todayStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function loadItems(): TrackerItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveItems(items: TrackerItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {}
}

export function newItem(title: string, type: TrackerItem['type']): TrackerItem {
  return {
    id: `${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    title: title.trim(),
    type,
    createdAt: todayStr(),
    history: [],
  };
}

export function checkedToday(item: TrackerItem): boolean {
  return item.history.includes(todayStr());
}

/** 今日打卡(幂等);小步打卡即视为完成。 */
export function checkIn(item: TrackerItem): TrackerItem {
  const t = todayStr();
  const history = item.history.includes(t) ? item.history : [...item.history, t];
  return { ...item, history, done: item.type === 'step' ? true : item.done };
}

/** 撤销今日打卡(手滑了可以收回)。 */
export function undoToday(item: TrackerItem): TrackerItem {
  const t = todayStr();
  return {
    ...item,
    history: item.history.filter((d) => d !== t),
    done: item.type === 'step' ? false : item.done,
  };
}

/** 连续打卡天数(到今天为止)。 */
export function streak(item: TrackerItem): number {
  const set = new Set(item.history);
  let n = 0;
  const d = new Date();
  // 今天没打也算从昨天起的连续,避免"今天还没打卡"就显示断了
  if (!set.has(todayStr(d))) d.setDate(d.getDate() - 1);
  while (set.has(todayStr(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** 最近 7 天是否打卡(用于轨迹小圆点),从 6 天前到今天。 */
export function last7(item: TrackerItem): boolean[] {
  const set = new Set(item.history);
  const out: boolean[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(set.has(todayStr(d)));
  }
  return out;
}

/**
 * 打卡后的正向反馈:温暖、具体、庆祝努力。带一点变化,避免机械。
 * 这里用模板(即时、离线可用、可控);措辞刻意不爹味、不夸张。
 */
export function feedbackLine(item: TrackerItem): string {
  const s = streak(item);
  if (item.type === 'step') {
    const lines = [
      '看见你做到了。哪怕是很小的一步,也是你为自己迈出去的,真好。',
      '嗯,你说要做的,你做到了。这一刻值得被认真地记一下。',
      '迈出去了呀。我知道有时候光是开始就很难,你做到了。',
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }
  if (s >= 7) return `已经第 ${s} 天了。不张扬,但你一直在,这件事挺动人的。`;
  if (s >= 3) return `连着 ${s} 天了。不是为了打卡好看,是你真的在好好待自己。`;
  if (s === 1) return '今天也来了。一天就是一天,够了,不用更多。';
  return '嗯,看见你了。来打个卡,本身就是一种温柔。';
}

/** 给聊天用的简短背景:让 Ease 像朋友一样自然地知道你最近在忙的小事。 */
export function summarize(items: TrackerItem[]): string {
  if (items.length === 0) return '';
  const active = items.filter((i) => !(i.type === 'step' && i.done));
  const doneSteps = items.filter((i) => i.type === 'step' && i.done);

  const parts: string[] = [];
  for (const i of active.slice(0, 8)) {
    const tag = i.type === 'habit' ? '习惯' : '小步';
    const st = streak(i);
    const today = checkedToday(i) ? '(今天已打卡)' : '';
    const streakTxt = i.type === 'habit' && st > 0 ? `,连续${st}天` : '';
    parts.push(`${tag}「${i.title}」${streakTxt}${today}`);
  }
  if (doneSteps.length) {
    parts.push(`最近完成的小步:${doneSteps.slice(-3).map((i) => `「${i.title}」`).join('、')}`);
  }
  return parts.join(';');
}
