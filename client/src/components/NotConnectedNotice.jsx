// Shown wherever a button would normally call the AI Design Engine. This build is
// frontend-only by design — see the project's implementation phases — so instead of
// silently failing or faking a result, we say plainly what's captured and what's next.
import { Construction } from 'lucide-react';

export default function NotConnectedNotice({ title, capturedSummary }) {
  return (
    <div className="notice notice--pending">
      <span className="notice-icon"><Construction size={22} strokeWidth={1.8} /></span>
      <div>
        <h4>{title}</h4>
        <p>
          The AI Design Engine isn't connected yet in this build — that's the next
          implementation phase. Your input below has been captured correctly and is ready
          to send once the AI step is wired in.
        </p>
        {capturedSummary ? <pre className="notice-summary">{capturedSummary}</pre> : null}
      </div>
    </div>
  );
}
