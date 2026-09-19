import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import BuilderCard from '../components/BuilderCard.jsx';
import { BUILDERS, SERVICE_LOCATIONS, SPECIALIZATIONS, matchBuilders } from '../data/builders.js';
import { listBuilders } from '../lib/api.js';
import { normalizeRealBuilder } from '../lib/builderDirectory.js';
import { areaOf } from '../lib/layout.js';

const RATING_MIN_OPTIONS = [0, 4, 4.5];

// "Find Your Builder" — spec section 9, with the section-10 match scoring
// layered on top whenever it arrives with `matchContext` (a design + a
// location the customer just typed in on the way here from a design's
// "Find a Builder for This Project" CTA). Browsed standalone from the
// navbar, it's a plain filterable directory — no score, since there's no
// project to score against yet.
export default function FindBuilders({ matchContext, onViewProfile, onContact }) {
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState(matchContext?.location || '');
  const [specialization, setSpecialization] = useState('');
  const [minRating, setMinRating] = useState(0);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [realBuilders, setRealBuilders] = useState([]);

  useEffect(() => {
    listBuilders().then((data) => setRealBuilders((data.builders || []).map(normalizeRealBuilder))).catch(() => {});
  }, []);

  const ALL_BUILDERS = useMemo(() => [...BUILDERS, ...realBuilders], [realBuilders]);

  const costPerArea = useMemo(() => {
    if (!matchContext?.design?.cost?.totalCost || !matchContext?.design?.layout) return null;
    const area = areaOf(matchContext.design.layout);
    return area ? matchContext.design.cost.totalCost / area : null;
  }, [matchContext]);

  const style = matchContext?.design?.layout?.style || null;

  const results = useMemo(() => {
    let entries = matchContext
      ? matchBuilders(ALL_BUILDERS, { location, style, costPerArea })
      : ALL_BUILDERS.map((builder) => ({ builder, score: null, reasons: [] }));

    const q = search.trim().toLowerCase();
    return entries.filter(({ builder }) => {
      if (q && !builder.name.toLowerCase().includes(q) && !builder.specializations.some((s) => s.toLowerCase().includes(q))) return false;
      if (!matchContext && location && !builder.serviceLocations.some((l) => l === location)) return false;
      if (specialization && !builder.specializations.includes(specialization)) return false;
      if (builder.rating < minRating) return false;
      if (availableOnly && builder.availability !== 'available') return false;
      return true;
    });
  }, [search, location, specialization, minRating, availableOnly, matchContext, style, costPerArea, ALL_BUILDERS]);

  return (
    <div className="find-builders">
      <section className="builders-hero">
        <span className="section-eyebrow">Construction Marketplace</span>
        <h2>Meet the people who can bring your design to life.</h2>
        <p className="section-sub">
          {matchContext
            ? `Builders matched to your ${matchContext.design.layout.title || 'project'}.`
            : 'Browse builders, contractors, and construction professionals across our service cities.'}
        </p>
        <p className="builders-demo-notice">
          Demo builder directory — these are sample profiles to demonstrate the matching experience, not yet a live network of onboarded, platform-verified partners.
        </p>
      </section>

      <div className="builders-filters">
        <label className="field field-search">
          <Search size={15} />
          <input type="text" placeholder="Search builders or specializations" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="field-inline">
          Location:
          <select value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">Any</option>
            {SERVICE_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label className="field-inline">
          Specialization:
          <select value={specialization} onChange={(e) => setSpecialization(e.target.value)}>
            <option value="">Any</option>
            {SPECIALIZATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="field-inline">
          Min rating:
          <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))}>
            {RATING_MIN_OPTIONS.map((r) => <option key={r} value={r}>{r === 0 ? 'Any' : `${r}+`}</option>)}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} /> Available now
        </label>
      </div>

      {matchContext && !location && (
        <p className="notice notice--pending" style={{ padding: '10px 14px' }}>
          Enter a location above to see match scores for this project.
        </p>
      )}

      <div className="builder-grid">
        {results.map(({ builder, score, reasons }) => (
          <BuilderCard
            key={builder.id}
            entry={builder}
            match={matchContext && location ? { score, reasons } : null}
            onViewProfile={onViewProfile}
            onContact={onContact}
          />
        ))}
        {results.length === 0 && (
          <div className="empty-state">
            <p>No builders match these filters — try widening your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
