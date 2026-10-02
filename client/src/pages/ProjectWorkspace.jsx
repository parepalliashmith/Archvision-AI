import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Box, CheckCircle2, Lock, SquarePen, XCircle } from 'lucide-react';
import { getInquiry, respondToQuotation, respondToRequest, sendQuotation } from '../lib/api.js';
import { areaOf, areaUnitOf, bedroomCountOf, floorCountOf, getPlotSize } from '../lib/layout.js';
import { fmtINR } from '../lib/format.js';
import HouseViewer3D from '../components/HouseViewer3D.jsx';
import FloorPlan2D from '../components/FloorPlan2D.jsx';
import MessageThread from '../components/MessageThread.jsx';
import ContactCard from '../components/ContactCard.jsx';
import RelationshipTimeline, { relationshipStatus } from '../components/RelationshipTimeline.jsx';

// The shared customer <-> builder workspace for one project: details on the left, the
// design (2D / 3D) in the centre, the conversation on the right, and the connection
// status along the bottom. Both roles use it; what each may see or do depends on the
// connection status the server reports (contact and chat unlock when the builder accepts).
export default function ProjectWorkspace({ inquiryId, viewer, onBack, backLabel = 'Back' }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('3d');
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState({ amount: '', weeks: '', notes: '' });
  const [actionError, setActionError] = useState('');

  const load = useCallback(() => {
    getInquiry({ id: inquiryId })
      .then(setData)
      .catch((e) => setError(e.message || 'Could not open this project.'));
  }, [inquiryId]);
  useEffect(load, [load]);

  async function act(fn) {
    setBusy(true); setActionError('');
    try { await fn(); await load(); } catch (e) { setActionError(e.message || 'Something went wrong.'); }
    setBusy(false);
  }

  if (error) return <div className="notice notice--error"><div><h4>Couldn't open this project</h4><p>{error}</p><button className="btn btn-ghost btn-sm" onClick={onBack}><ArrowLeft size={14} /> {backLabel}</button></div></div>;
  if (!data) return <p className="section-sub">Opening project…</p>;

  const { inquiry, contact, design, quotation, relationship } = data;
  const status = inquiry.status;
  const st = relationship.stages;
  const layout = design?.layout;
  const plot = layout ? getPlotSize(layout) : null;
  const canChat = !!contact || !inquiry.builderAccountId;
  const isBuilder = viewer === 'builder';
  const other = isBuilder ? inquiry.customerName : inquiry.builderName || 'Builder';

  return (
    <div className="workspace">
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 12 }}><ArrowLeft size={14} /> {backLabel}</button>

      <div className="rel-parties rel-parties--lg">
        <span className="rel-party rel-party--you">{isBuilder ? inquiry.customerName : 'You'}</span>
        <span className="rel-link" aria-hidden="true" />
        <span className="rel-party rel-party--builder">{isBuilder ? 'You' : inquiry.builderName || 'Builder'}</span>
      </div>
      <h3 className="workspace-title">{design?.title || inquiry.intent || 'Project request'} <span className="status-pill">{relationshipStatus(relationship, viewer)}</span></h3>

      {/* Actions that depend on the connection status */}
      {isBuilder && ['requested', 'reviewing'].includes(status) && (
        <div className="action-banner">
          <div><strong>New project request</strong><p>Review the design, then accept to share contact details and open the chat.</p></div>
          <div className="hero-actions">
            <button className="btn btn-navy btn-sm" disabled={busy} onClick={() => act(() => respondToRequest(inquiry.id, 'accept'))}>Accept Request</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(() => respondToRequest(inquiry.id, 'decline'))}>Decline</button>
          </div>
        </div>
      )}
      {!isBuilder && ['requested', 'reviewing'].includes(status) && (
        <div className="action-banner action-banner--quiet"><Lock size={18} /><div><strong>{status === 'reviewing' ? 'The builder is reviewing your project' : 'Request sent'}</strong><p>Email, phone and chat open as soon as the builder accepts.</p></div></div>
      )}
      {status === 'declined' && (
        <div className="action-banner action-banner--quiet"><XCircle size={18} /><div><strong>Request declined</strong><p>{isBuilder ? 'You declined this request.' : 'This builder cannot take the project right now. You can send it to another builder.'}</p></div></div>
      )}
      {status === 'project' && (
        <div className="action-banner action-banner--ok"><CheckCircle2 size={18} /><div><strong>Project started</strong><p>The quotation of {fmtINR(quotation.amount)} was accepted.</p></div></div>
      )}
      {status === 'quotation' && quotation && (
        <div className="action-banner">
          <div>
            <strong>Quotation: {fmtINR(quotation.amount)}{quotation.weeks ? ` · ${quotation.weeks} weeks` : ''}</strong>
            {quotation.notes && <p>{quotation.notes}</p>}
            <p className="muted-note">An approximate figure from the builder — confirm all scope and prices with them directly.</p>
          </div>
          {!isBuilder && (
            <div className="hero-actions">
              <button className="btn btn-navy btn-sm" disabled={busy} onClick={() => act(() => respondToQuotation(inquiry.id, 'accept'))}>Accept Quotation</button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(() => respondToQuotation(inquiry.id, 'decline'))}>Ask to Revise</button>
            </div>
          )}
        </div>
      )}
      {actionError && <p className="quote-form-error">{actionError}</p>}

      <div className="workspace-grid">
        {/* LEFT: project details */}
        <aside className="workspace-col">
          <div className="side-card">
            <h4>Project details</h4>
            <ul className="project-facts project-facts--stack">
              {layout && <>
                <li><span>Plot</span><strong>{plot.width}×{plot.depth}{plot.unit}</strong></li>
                <li><span>Built-up</span><strong>{areaOf(layout)} {areaUnitOf(layout)}</strong></li>
                <li><span>Floors</span><strong>{floorCountOf(layout)}</strong></li>
                <li><span>Bedrooms</span><strong>{bedroomCountOf(layout) || '—'}</strong></li>
                {layout.style && <li><span>Style</span><strong>{layout.style}</strong></li>}
              </>}
              {design?.cost && <li><span>Approx. cost</span><strong>{fmtINR(design.cost.totalCost)}</strong></li>}
              {inquiry.location && <li><span>Location</span><strong>{inquiry.location}</strong></li>}
              {!layout && inquiry.designSummary && Object.entries(inquiry.designSummary).map(([k, v]) => <li key={k}><span>{k}</span><strong>{String(v)}</strong></li>)}
            </ul>
            {inquiry.message && <p className="rel-last">“{inquiry.message}”</p>}
            {design?.cost && <p className="muted-note">Approximate planning estimate, not a quotation.</p>}
          </div>

          {contact ? (
            <ContactCard title={isBuilder ? 'Customer contact' : 'Builder contact'} name={contact.name || other} email={contact.email} phone={contact.phone} />
          ) : inquiry.builderAccountId ? (
            <div className="side-card locked-card"><Lock size={16} /> <span>Contact details unlock after the builder accepts.</span></div>
          ) : null}

          {isBuilder && ['accepted', 'quotation'].includes(status) && (
            <form className="side-card" onSubmit={(e) => { e.preventDefault(); act(() => sendQuotation(inquiry.id, quote)); }}>
              <h4>{status === 'quotation' ? 'Revise quotation' : 'Send quotation'}</h4>
              <label className="field">Amount (₹)<input type="number" min="1" required value={quote.amount} onChange={(e) => setQuote({ ...quote, amount: e.target.value })} /></label>
              <label className="field">Timeline (weeks)<input type="number" min="1" value={quote.weeks} onChange={(e) => setQuote({ ...quote, weeks: e.target.value })} /></label>
              <label className="field">Notes<textarea rows={3} value={quote.notes} onChange={(e) => setQuote({ ...quote, notes: e.target.value })} placeholder="Scope, materials, payment terms" /></label>
              <button className="btn btn-navy btn-sm" disabled={busy}>{status === 'quotation' ? 'Send revised quotation' : 'Send quotation'}</button>
            </form>
          )}
        </aside>

        {/* CENTRE: the design */}
        <section className="workspace-center">
          {layout ? (
            <div className="side-card">
              <div className="view-toggle" style={{ marginBottom: 10 }}>
                <button className={'tab-sm' + (view === '3d' ? ' active' : '')} onClick={() => setView('3d')}><Box size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />3D</button>
                <button className={'tab-sm' + (view === '2d' ? ' active' : '')} onClick={() => setView('2d')}><SquarePen size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />2D Plan</button>
              </div>
              {view === '3d'
                ? <div className="panel-viewer"><HouseViewer3D layout={layout} height={420} skipIntro /></div>
                : <FloorPlan2D design={layout} />}
            </div>
          ) : (
            <div className="empty-state"><p>No design was attached to this request.</p></div>
          )}
        </section>

        {/* RIGHT: conversation */}
        <aside className="workspace-col">
          {canChat ? (
            <MessageThread inquiryId={inquiry.id} viewerRole={viewer} />
          ) : (
            <div className="side-card locked-card"><Lock size={16} /> <span>The project chat opens once the builder accepts the request.</span></div>
          )}
        </aside>
      </div>

      {/* BOTTOM: status */}
      <div className="side-card workspace-status">
        <h4>Connection status</h4>
        <RelationshipTimeline rel={relationship} />
      </div>
    </div>
  );
}
