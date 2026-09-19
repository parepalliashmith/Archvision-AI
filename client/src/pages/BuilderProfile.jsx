import { useEffect, useState } from 'react';
import { ArrowLeft, BadgeCheck, Calendar, MapPin, MessageSquare, Star } from 'lucide-react';
import ProjectEnquiryForm from '../components/ProjectEnquiryForm.jsx';
import { BUILDERS } from '../data/builders.js';
import { listBuilders } from '../lib/api.js';
import { normalizeRealBuilder } from '../lib/builderDirectory.js';

const AVAILABILITY_LABEL = { available: 'Available now', busy: 'Currently busy', booked: 'Fully booked' };

const INTENTS = {
  contact: { label: 'Contact', message: "I'm interested in discussing my project with you." },
  quote: { label: 'Request Quotation', message: "I'd like to request a quotation for constructing this design." },
  consult: { label: 'Schedule Consultation', message: "I'd like to schedule a consultation to discuss this project." },
};

// Full builder profile — spec section 2. The three contact buttons all open
// the same ProjectEnquiryForm (no real quotation/scheduling backend exists
// yet — see the plan's explicitly-deferred list), just with a different
// pre-filled message per intent, so each button still does something
// distinct and honest rather than three dead ends.
export default function BuilderProfile({ builderId, design, initialIntent, onBack, onNavigate }) {
  const staticBuilder = BUILDERS.find((b) => b.id === builderId);
  const [realBuilder, setRealBuilder] = useState(undefined); // undefined = not checked yet, null = checked, not found
  const [openIntent, setOpenIntent] = useState(initialIntent || null);

  // Not in the static demo array — this id might be a real signed-up
  // builder's account id instead (see client/src/lib/builderDirectory.js).
  useEffect(() => {
    if (staticBuilder) return;
    listBuilders()
      .then((data) => {
        const match = (data.builders || []).find((b) => b.id === builderId);
        setRealBuilder(match ? normalizeRealBuilder(match) : null);
      })
      .catch(() => setRealBuilder(null));
  }, [builderId, staticBuilder]);

  const builder = staticBuilder || realBuilder;
  const isRealBuilder = !staticBuilder && !!realBuilder;
  const isNewBuilder = isRealBuilder && builder.rating === 0 && builder.projectsCompleted === 0;

  if (!staticBuilder && realBuilder === undefined) {
    return <p className="section-sub">Loading builder profile…</p>;
  }

  if (!builder) {
    return (
      <div className="empty-state">
        <p>Builder not found.</p>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>Back to Builders</button>
      </div>
    );
  }

  return (
    <div className="builder-profile">
      <button className="btn btn-ghost btn-sm" onClick={onBack}><ArrowLeft size={15} /> Back to Builders</button>

      <div className="builder-profile-header">
        <div className="builder-avatar builder-avatar--lg" style={{ background: builder.avatarColor }}>{builder.initials}</div>
        <div>
          <h2>
            {builder.name}
            {builder.verified && <span className="builder-verified" title="Platform-verified builder"><BadgeCheck size={17} /> Verified</span>}
          </h2>
          <div className="builder-card-meta">
            <span><Star size={14} fill="currentColor" /> {isNewBuilder ? 'New' : `${builder.rating} rating`}</span>
            <span>{builder.yearsExperience} years experience</span>
            <span><MapPin size={14} /> {builder.serviceLocations.join(', ')}</span>
          </div>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-card"><span className="stat-num">{isNewBuilder ? 'New' : `${builder.projectsCompleted}+`}</span><span className="stat-label">Projects completed</span></div>
        <div className="stat-card"><span className="stat-num">₹{builder.priceRange[0].toLocaleString('en-IN')}–{builder.priceRange[1].toLocaleString('en-IN')}</span><span className="stat-label">Per sqft</span></div>
        <div className="stat-card"><span className="stat-num">{AVAILABILITY_LABEL[builder.availability]}</span><span className="stat-label">Availability</span></div>
      </div>

      <section>
        <h3>About</h3>
        <p>{builder.about}</p>
        <p className="builder-card-specialties">Specializes in: {builder.specializations.join(' · ')}</p>
      </section>

      <section>
        <h3>Portfolio</h3>
        {builder.portfolio.length === 0 ? (
          <p className="section-sub" style={{ marginTop: 0 }}>No portfolio items yet.</p>
        ) : (
          <div className="portfolio-grid">
            {builder.portfolio.map((p, i) => (
              <div key={i} className="portfolio-card">
                <h4>{p.title}</h4>
                <p>{p.style} · {p.location} · {p.areaSqft.toLocaleString('en-IN')} sqft</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="builder-profile-actions">
        <button className="btn btn-primary btn-sm" onClick={() => setOpenIntent('contact')}><MessageSquare size={15} /> {INTENTS.contact.label}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpenIntent('quote')}>{INTENTS.quote.label}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpenIntent('consult')}><Calendar size={15} /> {INTENTS.consult.label}</button>
      </div>

      {openIntent && (
        <ProjectEnquiryForm
          design={design}
          builder={builder}
          intent={INTENTS[openIntent].message}
          onClose={() => setOpenIntent(null)}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}
