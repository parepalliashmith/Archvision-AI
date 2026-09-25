import { Check } from 'lucide-react';

const PLANS = [
  {
    name: 'Homeowner',
    price: 'Free',
    note: 'For anyone planning a home',
    features: [
      'Rule-based house designs with 3D walkthrough',
      'Upload a 2D plan and view it in 3D',
      'Cost estimate with breakdown',
      'Save and compare designs',
      'Message builders, see their email and phone after an enquiry',
    ],
    cta: 'Start Designing',
    go: 'create',
    featured: true,
  },
  {
    name: 'Builder / Civil Engineer',
    price: 'Free',
    note: 'For professionals taking on projects',
    features: [
      'Public profile in the Find a Builder directory',
      'Enquiries land in your dashboard and inbox',
      'Customer name, email and phone on every enquiry',
      'Reply in-app, or call and WhatsApp directly',
    ],
    cta: 'Register as a Builder',
    go: 'become-builder',
  },
  {
    name: 'Studio',
    price: 'Coming soon',
    note: 'Not available yet',
    features: [
      'Team accounts for firms',
      'Branded exports and shareable project pages',
      'Priority listing for builders',
    ],
    cta: null,
  },
];

export default function Pricing({ onNavigate }) {
  return (
    <div className="info-page">
      <section className="info-hero">
        <span className="section-eyebrow">Pricing</span>
        <h2>Free while we're in early access</h2>
        <p className="section-sub">Every feature listed below is live today and costs nothing. Paid plans, if they ever arrive, will be announced here first.</p>
      </section>

      <div className="plans-grid">
        {PLANS.map((p) => (
          <div key={p.name} className={'plan-card' + (p.featured ? ' plan-card--featured' : '')}>
            <h4>{p.name}</h4>
            <div className="plan-price">{p.price}</div>
            <p className="plan-note">{p.note}</p>
            <ul>
              {p.features.map((f) => <li key={f}><Check size={15} strokeWidth={2.6} /> {f}</li>)}
            </ul>
            {p.cta
              ? <button className={'btn ' + (p.featured ? 'btn-primary' : 'btn-ghost')} onClick={() => onNavigate(p.go)}>{p.cta}</button>
              : <button className="btn btn-ghost" disabled>Coming soon</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
