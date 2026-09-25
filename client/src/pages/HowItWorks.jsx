import { ArrowRight, Box, Calculator, ClipboardList, Handshake, Layers, PhoneCall } from 'lucide-react';

const STEPS = [
  { icon: ClipboardList, title: 'Enter your requirements', body: 'Plot size, budget, bedrooms and bathrooms, floors and style. It takes under a minute — or upload a photo of an existing 2D plan instead.' },
  { icon: Box, title: 'Get an instant 3D design', body: 'The design engine lays out rooms, doors and windows, then builds a 3D house you can orbit, walk through and film as a tour video.' },
  { icon: Layers, title: 'Refine and compare', body: "Not quite right? Generate another version, save the ones you like and compare them side by side." },
  { icon: Calculator, title: 'See the approximate cost', body: 'A rate-table estimate with a line-by-line breakdown, checked against your budget. It is an estimate, not a quotation.' },
  { icon: Handshake, title: 'Connect with a builder', body: 'Browse builders and civil engineers, send your design as an enquiry, and chat inside the app.' },
  { icon: PhoneCall, title: 'Talk by email and phone', body: 'Once you send an enquiry, you and the builder see each other’s verified email and registered phone — call, WhatsApp or email straight from the page.' },
];

const FAQ = [
  ['Do I need a password?', 'No. You sign in with a one-time code emailed to you — for customers and builders alike.'],
  ['Is the cost estimate a quote?', 'No. It is an approximate figure from standard per-sqft rates. Your builder gives the real quotation.'],
  ['Who sees my phone number?', 'Only the builder you send an enquiry to, and only after you send it. Builders’ numbers are shown to you the same way.'],
  ['Is this a replacement for an architect?', 'No. It is a design-assistance and visualization tool. Get final drawings checked by a licensed architect or structural engineer.'],
];

export default function HowItWorks({ onNavigate }) {
  return (
    <div className="info-page">
      <section className="info-hero">
        <span className="section-eyebrow">How it works</span>
        <h2>From an idea to a conversation with your builder</h2>
        <p className="section-sub">Six simple steps — the first four are entirely free and need no builder involved.</p>
      </section>

      <ol className="steps-grid">
        {STEPS.map((s, i) => (
          <li className="step-card" key={s.title}>
            <span className="step-num">{i + 1}</span>
            <span className="step-icon"><s.icon size={22} strokeWidth={1.7} /></span>
            <h4>{s.title}</h4>
            <p>{s.body}</p>
          </li>
        ))}
      </ol>

      <section className="info-faq">
        <h3>Common questions</h3>
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>

      <div className="cta-band">
        <div>
          <h3>Ready to see your home in 3D?</h3>
          <p>Start with your plot size and budget.</p>
        </div>
        <button className="btn btn-gold" onClick={() => onNavigate('create')}>Start Designing <ArrowRight size={16} /></button>
      </div>
    </div>
  );
}
