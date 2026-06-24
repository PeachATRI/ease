'use client';

import { useEffect, useRef, useState } from 'react';
import { GREETING } from '@/lib/prompts';

type Msg = { role: 'user' | 'assistant'; content: string };

// 极简渲染:把 **加粗** 转成 <strong>,其余原样(保留换行由 CSS white-space 处理)
function render(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    }
    return <span key={i}>{p}</span>;
  });
}

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([{ role: 'assistant', content: GREETING }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

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
        body: JSON.stringify({ messages: next }),
      });

      if (!res.body) throw new Error('no body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      // 先放一个空的助手气泡,逐字填充
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
    <div className="app">
      <header className="header">
        <h1>Ease</h1>
        <p>慢慢说,我一直在</p>
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
        <button className="send" onClick={send} disabled={busy || !input.trim()} aria-label="发送">
          ↑
        </button>
      </div>

      <div className="footnote">Ease 是陪伴与自助工具,不能替代心理咨询或医疗。危机时请拨打 12356。</div>
    </div>
  );
}
