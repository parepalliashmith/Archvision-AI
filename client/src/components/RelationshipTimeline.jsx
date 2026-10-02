import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';

// The customer <-> builder connection as a progress line. Every stage is derived from
// stored records on the server (see connectionStages in server.js) — never guessed.
export const STAGES = [
  { key: 'requested', label: 'Requested' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'contact', label: 'Contact enabled' },
  { key: 'discussion', label: 'Discussion' },
  { key: 'quotation', label: 'Quotation' },
  { key: 'project', label: 'Project started' },
];

export function stagesOf(rel) {
  return (rel && rel.stages) || { requested: true };
}

// One-line status for badges.
export function relationshipStatus(rel, viewer = 'customer') {
  const st = stagesOf(rel);
  if (st.declined) return 'Declined';
  if (st.project) return 'Project started';
  if (st.quotation) return viewer === 'customer' ? 'Quotation received' : 'Quotation sent';
  if (st.discussion) return 'In discussion';
  if (st.accepted) return 'Accepted — contact enabled';
  if (st.reviewing) return viewer === 'customer' ? 'Builder reviewing' : 'Reviewing';
  return viewer === 'customer' ? 'Waiting for builder' : 'New — respond';
}

export default function RelationshipTimeline({ rel, compact = false, vertical = false, animate = true }) {
  const st = stagesOf(rel);
  const stages = STAGES.map((s) => ({ ...s, done: !!st[s.key] }));
  const current = stages.findIndex((s) => !s.done);
  const cls = 'rel-line' + (compact ? ' rel-line--compact' : '') + (vertical ? ' rel-line--vertical' : '');
  return (
    <ol className={cls}>
      {stages.map((s, i) => {
        const declinedHere = st.declined && i === current;
        const state = declinedHere ? 'declined' : s.done ? 'done' : i === current && !st.declined ? 'current' : '';
        return (
          <motion.li
            key={s.key}
            className={state}
            initial={animate ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="rel-dot">{declinedHere ? <X size={11} strokeWidth={3} /> : s.done ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
            <span className="rel-label">{declinedHere ? 'Declined' : s.label}</span>
          </motion.li>
        );
      })}
    </ol>
  );
}
