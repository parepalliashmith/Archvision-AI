import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { fmtINR } from '../lib/format.js';

export default function CostPanel({ cost }) {
  if (!cost) return null;
  return (
    <div className="cost-panel">
      <h4>Approximate construction cost</h4>
      <div className="cost-total">{fmtINR(cost.totalCost)}</div>
      <ul className="cost-breakdown">
        <li>
          <span>Base construction ({cost.areaSqft} sqft @ {fmtINR(cost.ratePerSqft)}/sqft)</span>
          <span>{fmtINR(cost.baseCost)}</span>
        </li>
        {(cost.adjustments || []).map((a, i) => (
          <li key={i}>
            <span>{a.label}</span>
            <span>{fmtINR(a.amount)}</span>
          </li>
        ))}
      </ul>
      {cost.budgetTarget ? (
        <p className={'cost-budget ' + (cost.withinBudget ? 'cost-budget--ok' : 'cost-budget--over')}>
          {cost.withinBudget ? (
            <><CheckCircle2 size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />Within your {fmtINR(cost.budgetTarget)} budget ({fmtINR(Math.abs(cost.differenceFromBudget))} to spare).</>
          ) : (
            <><AlertTriangle size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />About {fmtINR(Math.abs(cost.differenceFromBudget))} over your {fmtINR(cost.budgetTarget)} budget.</>
          )}
        </p>
      ) : null}
      <p className="cost-disclaimer">{cost.disclaimer}</p>
    </div>
  );
}
