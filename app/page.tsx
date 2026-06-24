'use client';

import { useEffect, useRef, useState } from 'react';
import { GREETING } from '@/lib/prompts';
import Tracker from '@/components/Tracker';
import { loadItems, summarize, type TrackerItem } from '@/lib/tracker';

type Msg = { role: 'user' | 'assistant'; content: string };

const LS = {
  consent: 'ease.consent.v1',
  messages: 'ease.messages.v1',
  memory: 'ease.memory.v1',
  summarized: 'ease.summarized.v1',
};

// 长期记忆调度参数:始终保留最近 KEEP_RECENT 条原文进上下文,
// 更早的对话在累积到 TRIGGER 条未压缩时,折叠进"长期记忆"。
const KEEP_RECENT = 16;
const TRIGGER = 28;

// 极简渲染:把 **加粗** 转成 <strong>
function render(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <strong key={i}>{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

const initialThread: Msg[] = [{ role: 'assistant', content: GREETING }];

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [consented, setConsented] = useState(true); // 水合后再决定,避免闪烁
  const [messages, setMessages] = useState<Msg[]>(initialThread);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const memoryRef = useRef('');
  const trackerRef = useRef('');
  const summarizedRef = useRef(0);
  const threadRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // 水合:从 localStorage 恢复
  useEffect(() => {
    try {
      const c = localStorage.getItem(LS.consent);
      setConsented(c === '1');
      const m = localStorage.getItem(LS.messages);
      if (m) {
        const parsed = JSON.parse(m);
        if (Array.isArray(parsed) && parsed.length) setMessages(parsed);
      }
      memoryRef.current = localStorage.getItem(LS.memory) || '';
      summarizedRef.current = Number(localStorage.getItem(LS.summarized) || '0') || 0;
      trackerRef.current = summarize(loadItems());
    } catch {
      /* localStorage 不可用就用默认 */
    }
    setHydrated(true);
  }, []);

  // 持久化对话
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS.messages, JSON.stringify(messages));
    } catch {}
  }, [messages, hydrated]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  function autoGrow() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  }

  function acceptConsent() {
    try {
      localStorage.setItem(LS.consent, '1');
    } catch {}
    setConsented(true);
  }

  function reset() {
    if (!confirm('要清空这段对话、重新开始吗?\n(我对你的长期记忆会保留,你回来时我还记得你。)')) return;
    setMessages(initialThread);
    try {
      localStorage.removeItem(LS.messages);
      localStorage.setItem(LS.summarized, '0');
    } catch {}
    summarizedRef.current = 0;
  }

  // 把较早的对话折叠进长期记忆
  async function maybeSummarize(full: Msg[]) {
    const unsummarized = full.length - summarizedRef.current;
    if (unsummarized < TRIGGER) return;
    const foldEnd = full.length - KEEP_RECENT;
    const chunk = full.slice(summarizedRef.current, foldEnd);
    if (chunk.length === 0) return;
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memory: memoryRef.current, messages: chunk }),
      });
      const data = await res.json();
      if (data?.memory) {
        memoryRef.current = data.memory;
        summarizedRef.current = foldEnd;
        try {
          localStorage.setItem(LS.memory, data.memory);
          localStorage.setItem(LS.summarized, String(foldEnd));
        } catch {}
      }
    } catch {
      /* 记忆压缩失败不影响聊天 */
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    if (taRef.current) taRef.current.style.height = 'auto';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          memory: memoryRef.current,
          tracker: trackerRef.current,
        }),
      });
      if (!res.body) throw new Error('no body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      setMessages((m) => [...m, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: 'assistant',
            content: copy[copy.length - 1].content + chunk,
          };
          return copy;
        });
      }

      // 回应结束后,看是否需要把旧对话折叠进长期记忆
      setMessages((m) => {
        maybeSummarize(m);
        return m;
      });
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: '抱歉,刚刚没连上。你愿意再发一次吗?' },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const lastIsEmptyAssistant =
    messages[messages.length - 1]?.role === 'assistant' &&
    messages[messages.length - 1]?.content === '';

  return (
    <>
      <div className="ambient" aria-hidden />

      <Tracker
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onChange={(items: TrackerItem[]) => {
          trackerRef.current = summarize(items);
        }}
      />

      {hydrated && !consented && (
        <div className="consent-mask">
          <div className="consent">
            <h2>在你坐下来之前 🌿</h2>
            <p>
              Ease 是一个温柔的陪伴空间,会借助一些成熟的心理学方法,陪你走过焦虑、纠结、内耗和迷茫的时刻。
            </p>
            <p className="fine">
              它<strong>不是</strong>心理咨询、诊断或治疗,也不能替代精神科医生或心理咨询师。它说的话仅供参考,不构成专业的医疗建议。
            </p>
            <p className="fine">
              如果你正处在危机中、或有伤害自己的念头,请立刻联系专业帮助:全国心理援助热线 <strong>12356</strong>,紧急情况拨打 <strong>120</strong>。
            </p>
            <p className="fine">
              你的对话和记忆只保存在你自己的浏览器里。你随时可以清空它。
            </p>
            <button onClick={acceptConsent}>我了解了,进来坐坐</button>
          </div>
        </div>
      )}

      <div className="app">
        <header className="header">
          <h1>Ease</h1>
          <p>慢慢说,我一直在</p>
          <button className="steps-btn" onClick={() => setPanelOpen(true)}>
            小步
          </button>
          <button className="reset" onClick={reset}>
            重新开始
          </button>
        </header>

        <div className="thread" ref={threadRef}>
          {messages.map((m, i) => (
            <div key={i} className={`row ${m.role}`}>
              <div className="bubble">
                {m.content ? (
                  render(m.content)
                ) : (
                  <span className="dots">
                    <span />
                    <span />
                    <span />
                  </span>
                )}
              </div>
            </div>
          ))}
          {busy && !lastIsEmptyAssistant && (
            <div className="row assistant">
              <div className="bubble">
                <span className="dots">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="composer">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoGrow();
            }}
            onKeyDown={onKeyDown}
            placeholder="此刻,有什么压在你心里……"
            rows={1}
          />
          <button
            className="send"
            onClick={send}
            disabled={busy || !input.trim()}
            aria-label="发送"
          >
            ↑
          </button>
        </div>

        <div className="footnote">
          Ease 是陪伴与自助工具,不能替代心理咨询或医疗。危机时请拨打 12356。
        </div>
      </div>
    </>
  );
}
