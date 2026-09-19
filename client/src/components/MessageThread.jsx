import { useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { listMessages, sendMessage } from '../lib/api.js';

const POLL_MS = 9000;

function timeLabel(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Two-way thread on a single inquiry. Access is via the logged-in session
// (attached automatically to every api.js call — see authHeaders() there)
// for a real customer or builder account, or via `token` — a demo builder's
// per-inquiry access token from the emailed reply link, the only credential
// a curated demo builder (no real account) ever has. `viewerRole` decides
// which messages render as "you" vs. the other party.
export default function MessageThread({ inquiryId, token, viewerRole }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const logRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const data = await listMessages({ inquiryId, token });
        if (!cancelled) setMessages(data.messages || []);
      } catch {
        // Best-effort polling — a transient failure just waits for the next tick.
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [inquiryId, token]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages]);

  async function handleSubmit(e) {
    e.preventDefault();
    const body = input.trim();
    if (!body) return;
    setSending(true);
    setError('');
    try {
      const result = await sendMessage({ inquiryId, token, body });
      setMessages((prev) => [...prev, result.message]);
      setInput('');
    } catch (err) {
      setError(err.message || 'Message failed to send — please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-panel">
      <h4><MessageCircle size={17} style={{ verticalAlign: '-3px', marginRight: 6 }} />Conversation</h4>
      {messages.length === 0 ? (
        <p className="section-sub" style={{ marginTop: 0 }}>
          No messages yet — send one below to start the conversation.
        </p>
      ) : (
        <div className="chat-log" ref={logRef}>
          {messages.map((m) => (
            <div key={m.id} className={'chat-msg chat-msg--' + (m.senderRole === viewerRole ? 'user' : 'system')}>
              <div className="chat-msg-meta">{m.senderName || (m.senderRole === 'builder' ? 'Builder' : 'Customer')} · {timeLabel(m.createdAt)}</div>
              {m.body}
            </div>
          ))}
        </div>
      )}
      {error && <p className="quote-form-error">{error}</p>}
      <form className="chat-input-row" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          disabled={sending}
        />
        <button className={'btn btn-primary btn-sm' + (sending ? ' btn-loading' : '')} type="submit" disabled={sending || !input.trim()}>
          {sending ? (<><span className="spinner" /> Sending…</>) : 'Send'}
        </button>
      </form>
    </div>
  );
}
