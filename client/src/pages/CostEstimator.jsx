import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { estimateCost } from '../lib/api.js';
import { fmtINR } from '../lib/format.js';

const HOUSE_TYPES = [
  { value: 'independent-house', label: 'Independent House' },
  { value: 'villa', label: 'Villa' },
  { value: 'duplex', label: 'Duplex' },
  { value: 'row-house', label: 'Row House' },
  { value: 'apartment', label: 'Apartment / Flat' },
];

const FINISH_QUALITIES = [
  { value: 'basic', label: 'Basic', hint: 'Standard tiles, basic fittings, minimal decor — most economical.' },
  { value: 'standard', label: 'Standard', hint: 'Good-quality tiles and fittings — the typical mid-range choice.' },
  { value: 'premium', label: 'Premium', hint: 'Branded fittings, better tiles/countertops, more finishing detail.' },
  { value: 'luxury', label: 'Luxury', hint: 'High-end materials and fittings throughout — the most expensive tier.' },
];

const EMPTY_FORM = {
  builtUpAreaSqft: '',
  floors: '1',
  bedrooms: '',
  houseType: 'independent-house',
  finishQuality: 'standard',
  budget: '',
};

export default function CostEstimator() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState(null); // { kind: 'loading'|'error', message } | null

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus({ kind: 'loading' });
    try {
      const data = await estimateCost({
        builtUpAreaSqft: form.builtUpAreaSqft,
        floors: form.floors,
        bedrooms: form.bedrooms,
        houseType: form.houseType,
        finishQuality: form.finishQuality,
        budget: form.budget || undefined,
      });
      setResult(data);
      setStatus(null);
    } catch (err) {
      setStatus({ kind: 'error', message: err.message || 'Could not compute an estimate.' });
    }
  }

  return (
    <div className="cost-estimator-page">
      <p className="section-sub" style={{ marginTop: 0 }}>
        A quick, standalone construction cost estimate — no floor plan required. Enter the basics
        below to get an approximate budget breakdown.
      </p>

      <form className="form-grid" onSubmit={handleSubmit}>
        <label className="field">
          <span>Total built-up area (sqft)</span>
          <input type="number" min="100" max="20000" required value={form.builtUpAreaSqft} onChange={(e) => update('builtUpAreaSqft', e.target.value)} placeholder="1500" />
          <small className="field-hint">Add up the floor area across all floors combined.</small>
        </label>
        <label className="field">
          <span>Number of floors</span>
          <select value={form.floors} onChange={(e) => update('floors', e.target.value)}>
            <option value="1">1 (single storey)</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </label>
        <label className="field">
          <span>Number of bedrooms</span>
          <input type="number" min="1" max="10" required value={form.bedrooms} onChange={(e) => update('bedrooms', e.target.value)} placeholder="3" />
        </label>
        <label className="field">
          <span>House type</span>
          <select value={form.houseType} onChange={(e) => update('houseType', e.target.value)}>
            {HOUSE_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Finish quality</span>
          <select value={form.finishQuality} onChange={(e) => update('finishQuality', e.target.value)}>
            {FINISH_QUALITIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <small className="field-hint">{FINISH_QUALITIES.find((o) => o.value === form.finishQuality)?.hint}</small>
        </label>
        <label className="field">
          <span>Your budget (₹) — optional</span>
          <input type="number" min="0" step="10000" value={form.budget} onChange={(e) => update('budget', e.target.value)} placeholder="3500000" />
          <small className="field-hint">Fill this in to see if the estimate fits your budget.</small>
        </label>
        <div className="field-wide">
          <button className={'btn btn-primary' + (status?.kind === 'loading' ? ' btn-loading' : '')} type="submit" disabled={status?.kind === 'loading'}>
            {status?.kind === 'loading' ? (<><span className="spinner" /> Calculating…</>) : 'Calculate Estimate'}
          </button>
        </div>
      </form>

      {status?.kind === 'error' && (
        <div className="notice notice--error">
          <span className="notice-icon"><AlertTriangle size={22} strokeWidth={1.8} /></span>
          <div><p style={{ margin: 0 }}>{status.message}</p></div>
        </div>
      )}

      {result && (
        <div className="result cost-estimate-result">
          <p className="estimate-label"><ClipboardCheck size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />Approximate planning estimate — not a construction quotation</p>

          <div className="estimate-headline-row">
            <div className="estimate-headline">
              <span className="estimate-headline-label">Total Estimated Cost</span>
              <span className="estimate-headline-value">{fmtINR(result.totalCost)}</span>
            </div>
            <div className="estimate-headline">
              <span className="estimate-headline-label">Cost per sqft</span>
              <span className="estimate-headline-value estimate-headline-value--sm">{fmtINR(result.costPerSqft)}</span>
            </div>
            {result.budget !== undefined && (
              <div className="estimate-headline">
                <span className="estimate-headline-label">Your Budget</span>
                <span className="estimate-headline-value estimate-headline-value--sm">{fmtINR(result.budget)}</span>
              </div>
            )}
          </div>

          {result.budget !== undefined && (
            <p className={'cost-budget ' + (result.exceedsBudget ? 'cost-budget--over' : 'cost-budget--ok')}>
              {result.exceedsBudget ? (
                <><AlertTriangle size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />Over budget by {fmtINR(Math.abs(result.difference))}</>
              ) : (
                <><CheckCircle2 size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />Within budget — {fmtINR(Math.abs(result.difference))} to spare</>
              )}
            </p>
          )}

          <h4>Cost Breakdown</h4>
          <ul className="cost-breakdown">
            {result.breakdown.map((b) => (
              <li key={b.key}>
                <span>{b.label} <em className="breakdown-pct">({b.percentage}%)</em></span>
                <span>{fmtINR(b.amount)}</span>
              </li>
            ))}
          </ul>

          {result.exceedsBudget && (
            <div className="notice notice--error">
              <span className="notice-icon"><AlertTriangle size={22} strokeWidth={1.8} /></span>
              <div>
                <h4 style={{ margin: '0 0 6px' }}>{result.warningMessage}</h4>
                <p style={{ margin: '0 0 6px' }}>Possible ways to bring this within budget:</p>
                <ul className="suggestions-list">
                  {result.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            </div>
          )}

          <p className="cost-disclaimer">{result.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
