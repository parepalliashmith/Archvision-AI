import { BadgeCheck, MapPin, Star } from 'lucide-react';

function fmtPrice([min, max]) {
  return `₹${min.toLocaleString('en-IN')}–${max.toLocaleString('en-IN')}/sqft`;
}

const AVAILABILITY_LABEL = { available: 'Available now', busy: 'Currently busy', booked: 'Fully booked' };

// One card, reused on the discovery grid and (compact match preview) inline
// results. `match` is optional — {score, reasons} from matchBuilders(); when
// present the score badge + reasons render, when absent it's a plain
// browse-the-directory card. Deliberately no live 3D/photo per card — see
// the MyDesigns dashboard decision this session about not mounting many
// WebGL contexts in a grid; here there's no photo asset at all to mount,
// just a procedural initials avatar.
export default function BuilderCard({ entry, match, onViewProfile, onContact }) {
  const b = entry;
  const isNew = b.rating === 0 && b.projectsCompleted === 0;
  return (
    <div className="builder-card">
      <div className="builder-card-top">
        <div className="builder-avatar" style={{ background: b.avatarColor }}>{b.initials}</div>
        <div className="builder-card-heading">
          <h4>
            {b.name}
            {b.verified && <span className="builder-verified" title="Platform-verified builder"><BadgeCheck size={15} /> Verified</span>}
          </h4>
          <div className="builder-card-meta">
            <span><Star size={13} fill="currentColor" /> {isNew ? 'New' : b.rating}</span>
            <span>{b.yearsExperience} yrs experience</span>
            <span><MapPin size={13} /> {b.serviceLocations.join(', ')}</span>
          </div>
        </div>
      </div>

      {match && (
        <div className="match-badge">
          <div className="match-badge-score">{match.score}% Match</div>
          <ul className="match-reasons">
            {match.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      <div className="builder-card-stats">
        <div><span className="builder-card-stat-label">Projects</span><span className="builder-card-stat-value">{isNew ? 'New' : `${b.projectsCompleted}+`}</span></div>
        <div><span className="builder-card-stat-label">Price range</span><span className="builder-card-stat-value">{fmtPrice(b.priceRange)}</span></div>
        <div><span className="builder-card-stat-label">Availability</span><span className="builder-card-stat-value">{AVAILABILITY_LABEL[b.availability]}</span></div>
      </div>

      <p className="builder-card-specialties">{b.specializations.join(' · ')}</p>

      <div className="builder-card-actions">
        <button className="btn btn-primary btn-sm" onClick={() => onViewProfile(b.id)}>View Profile</button>
        <button className="btn btn-ghost btn-sm" onClick={() => onContact(b.id)}>Contact</button>
      </div>
    </div>
  );
}
