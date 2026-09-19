import { useRef, useState } from 'react';
import { AlertTriangle, Construction, Hammer, Save, ScanLine } from 'lucide-react';
import HouseViewer3D from '../components/HouseViewer3D.jsx';
import RoomLegend from '../components/RoomLegend.jsx';
import CostPanel from '../components/CostPanel.jsx';
import BuilderQuoteForm from '../components/BuilderQuoteForm.jsx';
import { generateDesign } from '../lib/api.js';
import { isLoggedIn } from '../lib/auth.js';
import { areaOf, areaUnitOf, roomCountOf, floorCountOf } from '../lib/layout.js';

// Upload -> Computer Vision -> Structured floor plan -> 3D model. The "computer
// vision" step is Gemini's multimodal vision model (the same AI already used
// elsewhere in this app for language tasks) reading the photo/scan/blueprint and
// identifying rooms, doors, windows, and a staircase — see buildImagePrompt() in
// server.js. Its output is untrusted input like any AI response: server.js's
// sanitizeLayout() clamps and validates every field before it ever reaches this
// page, and floorPlan2D.js's geometry validator would still reject anything
// physically nonsensical. The 3D geometry itself is built the same deterministic
// way as every other design in this app (houseModel.js) — the AI identifies WHAT
// the rooms are, it never hand-places the final 3D coordinates.
//
// Scope note: this view shows the 3D model and cost estimate, not the 2D SVG
// floor-plan renderer — that renderer (FloorPlan2D.jsx) is built specifically
// around the rule-based generator's feet-based `plot`/wall-network shape, which
// an AI-read photo doesn't produce. Extending it to a second data shape is a
// reasonable future improvement, not done here to avoid a half-tested rewrite.
export default function UploadPlan({ onSave, onFindBuilder, onNavigate }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState(null); // { kind: 'loading'|'error'|'not-configured', message } | null
  const [result, setResult] = useState(null); // { layout, cost } | null
  const [saveState, setSaveState] = useState('idle');
  const inputRef = useRef(null);

  function pickFile(f) {
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setResult(null);
    setStatus(null);
  }

  async function handleAnalyze() {
    if (!file) return;
    setStatus({ kind: 'loading' });
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('floorplan', file);
      const data = await generateDesign(formData);
      setResult(data);
      setStatus(null);
    } catch (err) {
      const message = err.message || 'Could not analyze that floor plan.';
      const notConfigured = /not configured/i.test(message);
      setStatus({ kind: notConfigured ? 'not-configured' : 'error', message });
    }
  }

  async function handleSave() {
    if (!result) return;
    if (!isLoggedIn()) {
      onNavigate?.('login');
      return;
    }
    setSaveState('saving');
    try {
      await onSave({ layout: result.layout, cost: result.cost, requirements: null, title: result.layout.title });
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('idle');
    }
  }

  return (
    <div className="upload-plan">
      <label
        className={'dropzone' + (dragging ? ' dragover' : '')}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files[0]); }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
          hidden
          onChange={(e) => pickFile(e.target.files[0])}
        />
        <span className="dropzone-icon"><ScanLine size={30} strokeWidth={1.6} /></span>
        <span className="dropzone-text"><strong>Click to upload</strong> or drag a floor plan image/PDF here</span>
        <span className="dropzone-hint">PNG, JPG, PDF — sketches, blueprints, or CAD exports all work</span>
        {previewUrl ? <img src={previewUrl} alt="" className="preview-img" /> : null}
      </label>
      <button
        className={'btn btn-primary' + (status?.kind === 'loading' ? ' btn-loading' : '')}
        onClick={handleAnalyze}
        disabled={!file || status?.kind === 'loading'}
      >
        {status?.kind === 'loading' ? (<><span className="spinner" /> Reading your floor plan…</>) : 'Analyze Floor Plan'}
      </button>

      {status?.kind === 'not-configured' && (
        <div className="notice notice--pending">
          <span className="notice-icon"><Construction size={22} strokeWidth={1.8} /></span>
          <div>
            <h4>AI vision analysis isn't connected yet</h4>
            <p>
              This needs a Gemini API key set as <code>GEMINI_API_KEY</code> on the server — see the
              README's Environment Variables section. Your file was captured correctly and is ready
              to send once that's configured.
            </p>
            <pre className="notice-summary">{`File: ${file?.name} (${((file?.size || 0) / 1024).toFixed(0)} KB, ${file?.type || 'unknown type'})`}</pre>
          </div>
        </div>
      )}

      {status?.kind === 'error' && (
        <div className="notice notice--error">
          <span className="notice-icon"><AlertTriangle size={22} strokeWidth={1.8} /></span>
          <div><p style={{ margin: 0 }}>{status.message}</p></div>
        </div>
      )}

      {result && (
        <div className="result">
          <div className="result-header">
            <div>
              <h3>{result.layout.title}</h3>
              <p className="result-summary">{result.layout.summary}</p>
              <p className="result-summary">{areaOf(result.layout)} {areaUnitOf(result.layout)} · {roomCountOf(result.layout)} rooms
                {floorCountOf(result.layout) > 1 ? ` · ${floorCountOf(result.layout)} floors` : ''}
              </p>
            </div>
            <div className="viewer-controls">
              <button className="btn btn-ghost btn-sm" onClick={handleSave} disabled={saveState === 'saving'}>
                {saveState === 'saved' ? 'Saved ✓' : saveState === 'saving' ? 'Saving…' : (<><Save size={15} /> Save to My Designs</>)}
              </button>
            </div>
          </div>
          <div className="viewer-wrap">
            <HouseViewer3D layout={result.layout} height={420} />
            <RoomLegend layout={result.layout} />
          </div>
          <CostPanel cost={result.cost} />

          <div className="builder-cta-row">
            <div>
              <strong>Love this design?</strong>
              <p>Connect with a builder who can bring it to life.</p>
            </div>
            <div className="builder-cta-actions">
              <button className="btn btn-primary" onClick={() => onFindBuilder?.(result)}>
                <Hammer size={16} /> Find a Builder for This Project
              </button>
              <BuilderQuoteForm design={result} triggerLabel="Talk to a Construction Expert" onNavigate={onNavigate} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
