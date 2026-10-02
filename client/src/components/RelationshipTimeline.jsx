import { Check } from 'lucide-react';

// The customer <-> builder relationship as a short progress line. Each step is only
// ticked when the matching record exists (see server.js withRelationship) — nothing
// here is guessed.
export function relationshipSteps(rel) {
  const r = rel || {};
  return [
    { label: 'Design shared', done: !!r.designShared },
    { label: 'Enquiry sent', done: true },
    { label: 'Builder replied', done: !!r.builderReplied },
    { label: 'Contact shared', done: !!r.contactShared },
  ];
}

export function relationshipStatus(rel, viewer = 'customer') {
  if (!rel) return '';
  if (rel.builderReplied) return viewer === 'customer' ? 'Builder replied' : 'You replied';
  return viewer === 'customer' ? 'Waiting for builder' : 'New — reply needed';
}

export default function RelationshipTimeline({ rel, compact = false }) {
  const steps = relationshipSteps(rel);
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className={'rel-line' + (compact ? ' rel-line--compact' : '')}>
      {steps.map((s, i) => (
        <li key={s.label} className={s.done ? 'done' : i === current ? 'current' : ''}>
          <span className="rel-dot">{s.done ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
          <span className="rel-label">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
