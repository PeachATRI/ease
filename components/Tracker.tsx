'use client';

import { useEffect, useState } from 'react';
import {
  type TrackerItem,
  loadItems,
  saveItems,
  newItem,
  checkIn,
  undoToday,
  checkedToday,
  streak,
  last7,
  feedbackLine,
} from '@/lib/tracker';

export default function Tracker({
  open,
  onClose,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  onChange: (items: TrackerItem[]) => void;
}) {
  const [items, setItems] = useState<TrackerItem[]>([]);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TrackerItem['type']>('habit');
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  useEffect(() => {
    setItems(loadItems());
  }, [open]);

  function commit(next: TrackerItem[]) {
    setItems(next);
    saveItems(next);
    onChange(next);
  }

  function add() {
    const t = title.trim();
    if (!t) return;
    commit([newItem(t, type), ...items]);
    setTitle('');
  }

  function doCheckIn(item: TrackerItem) {
    const updated = checkIn(item);
    commit(items.map((i) => (i.id === item.id ? updated : i)));
    setFeedback((f) => ({ ...f, [item.id]: feedbackLine(updated) }));
  }

  function doUndo(item: TrackerItem) {
    commit(items.map((i) => (i.id === item.id ? undoToday(item) : i)));
    setFeedback((f) => {
      const c = { ...f };
      delete c[item.id];
      return c;
    });
  }

  function remove(item: TrackerItem) {
    if (!confirm(`不再记录「${item.title}」了吗?`)) return;
    commit(items.filter((i) => i.id !== item.id));
  }

  if (!open) return null;

  const active = items.filter((i) => !(i.type === 'step' && i.done));
  const doneSteps = items.filter((i) => i.type === 'step' && i.done);

  return (
    <div className="panel-mask" onClick={onClose}>
      <aside className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>我的小步</h2>
          <button className="panel-x" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <p className="panel-sub">一点点就好。来过,本身就值得被看见。</p>

        <div className="add-row">
          <div className="type-toggle">
            <button
              className={type === 'habit' ? 'on' : ''}
              onClick={() => setType('habit')}
            >
              习惯
            </button>
            <button className={type === 'step' ? 'on' : ''} onClick={() => setType('step')}>
              小步
            </button>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder={type === 'habit' ? '想慢慢养成的,比如「好好吃早饭」' : '想完成的一件小事'}
          />
          <button className="add-btn" onClick={add} disabled={!title.trim()}>
            添加
          </button>
        </div>

        <div className="items">
          {active.length === 0 && doneSteps.length === 0 && (
            <p className="empty">还没有。不急,等你想为自己做点什么的时候,再加。</p>
          )}

          {active.map((item) => {
            const done = checkedToday(item);
            return (
              <div key={item.id} className="item">
                <div className="item-top">
                  <span className="item-title">{item.title}</span>
                  <button className="item-del" onClick={() => remove(item)} aria-label="删除">
                    移除
                  </button>
                </div>

                {item.type === 'habit' && (
                  <div className="dots7">
                    {last7(item).map((on, i) => (
                      <span key={i} className={on ? 'on' : ''} />
                    ))}
                    {streak(item) > 0 && <span className="streak">连续 {streak(item)} 天</span>}
                  </div>
                )}

                <button
                  className={`checkin ${done ? 'done' : ''}`}
                  onClick={() => (done ? doUndo(item) : doCheckIn(item))}
                >
                  {done ? (item.type === 'step' ? '✓ 已完成(点此撤销)' : '✓ 今天打过卡了') : item.type === 'step' ? '我做到了' : '今天打卡'}
                </button>

                {feedback[item.id] && <p className="item-fb">{feedback[item.id]}</p>}
              </div>
            );
          })}

          {doneSteps.length > 0 && (
            <div className="done-block">
              <p className="done-title">已经做到的</p>
              {doneSteps.map((item) => (
                <div key={item.id} className="done-step">
                  <span>✓ {item.title}</span>
                  <button className="item-del" onClick={() => remove(item)}>
                    移除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
