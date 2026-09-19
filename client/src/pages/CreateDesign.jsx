import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Box, Camera, Clapperboard, Download, Footprints, Gamepad2, Hammer, MessageCircle, Palette, RotateCcw, Save, SquarePen, ThumbsDown, ThumbsUp, Video, X } from 'lucide-react';
import HouseViewer3D from '../components/HouseViewer3D.jsx';
import RoomLegend from '../components/RoomLegend.jsx';
import CostPanel from '../components/CostPanel.jsx';
import FloorPlan2D from '../components/FloorPlan2D.jsx';
import Elevation2D from '../components/Elevation2D.jsx';
import BuilderQuoteForm from '../components/BuilderQuoteForm.jsx';
import { generateRuleBasedDesign, chatModifyDesign } from '../lib/api.js';
import { isLoggedIn } from '../lib/auth.js';
import { floorCountOf } from '../lib/layout.js';
import { buildHouseModel } from '../three/houseModel.js';
import { buildElevations } from '../three/elevations.js';

const STYLE_OPTIONS = ['Modern', 'Traditional', 'Contemporary', 'Farmhouse', 'Compact urban'];
const KITCHEN_OPTIONS = ['Open-plan', 'Closed / separate', 'Modular'];
const LIVING_OPTIONS = ['Compact', 'Medium', 'Large / open-plan'];

const EMPTY_FORM = {
  plotWidth: '',  // frontage — the side facing the road (ft)
  plotLength: '', // depth — front-to-back (ft)
  budget: '',
  bedrooms: '',
  bathrooms: '',
  floors: '1',
  parking: false,
  kitchen: '',
  livingRoom: '',
  garden: false,
  style: '',
};

export default function CreateDesign({ loadedDesign, onSave, onFindBuilder, onNavigate }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState(null); // { kind: 'loading'|'error', message } | null
  // Every generated design (the original, plus every "Generate Another Design"
  // result) is kept as its own entry here rather than overwritten — this is the
  // "store each generated design as a separate version" requirement. Each entry:
  // { layout, cost, requirements, feedback: null|'like'|'dislike' }.
  const [history, setHistory] = useState(
    loadedDesign ? [{ ...loadedDesign, requirements: loadedDesign.requirements || {}, feedback: null }] : []
  );
  const [historyIndex, setHistoryIndex] = useState(loadedDesign ? 0 : -1);
  const [regenerating, setRegenerating] = useState(false);
  const activeDesign = historyIndex >= 0 ? history[historyIndex] : null;
  // "Generate Another"/chat-modify both regenerate via the rule-based engine,
  // which needs plotWidthFt/plotDepthFt — present on anything built from the
  // form, absent on a design loaded from an uploaded-plan analysis (that path
  // has no "requirements" to regenerate from at all, by design — see
  // UploadPlan.jsx's header comment). Gating on this avoids surfacing a
  // confusing "provide plotWidthFt" error for a design where that never applies.
  const isRuleBased = !!activeDesign?.requirements?.plotWidthFt;
  const viewerRef = useRef(null);
  const [saveState, setSaveState] = useState('idle');
  const [viewMode, setViewMode] = useState('3d'); // '3d' | '2d'
  const [resultRevision, setResultRevision] = useState(0); // bumped on every new result, to retrigger its entrance animation
  const [walkthroughOn, setWalkthroughOn] = useState(false);
  const [showElevations, setShowElevations] = useState(false);
  const [lightingMode, setLightingMode] = useState('day');
  const [renderShots, setRenderShots] = useState(null); // [{label, dataUrl}] | null
  const [capturingRenders, setCapturingRenders] = useState(false);
  const [tourVideoUrl, setTourVideoUrl] = useState(null);
  const [generatingTour, setGeneratingTour] = useState(false);
  const [tourProgress, setTourProgress] = useState('');
  const tourVideoUrlRef = useRef(null);
  tourVideoUrlRef.current = tourVideoUrl;
  const [roomVideos, setRoomVideos] = useState(null); // [{roomName, floorLevel, url}] | null
  const [generatingRoomVideos, setGeneratingRoomVideos] = useState(false);
  const [roomVideoProgress, setRoomVideoProgress] = useState('');
  const roomVideosRef = useRef(null);
  roomVideosRef.current = roomVideos;
  // Elevations are a straight projection of the SAME 3D model the viewer
  // already builds (see elevations.js's header comment) — computed here too
  // since this page needs the wall/roof/accent colors alongside the geometry,
  // and unlike the 2D floor plan (backend-only, rule-based-specific) this
  // works for any layout shape buildHouseModel accepts, uploaded plans included.
  const elevationModel = useMemo(
    () => (activeDesign?.layout ? buildHouseModel(activeDesign.layout) : null),
    [activeDesign]
  );
  const elevations = useMemo(
    () => (elevationModel ? buildElevations(elevationModel) : null),
    [elevationModel]
  );
  // Conversational edits — see server.js's /api/design/chat-modify. { role: 'user'|'system', text, error? }
  const [chatLog, setChatLog] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  // A design loaded from "My Designs" should take over the result panel as a
  // fresh single-entry version history.
  useEffect(() => {
    if (loadedDesign) {
      setHistory([{ ...loadedDesign, requirements: loadedDesign.requirements || {}, feedback: null }]);
      setHistoryIndex(0);
      setResultRevision((r) => r + 1);
      setChatLog([]);
    }
  }, [loadedDesign]);

  // A newly generated/loaded/regenerated design gets its own fresh viewer instance
  // (see resultRevision's `key` on the .result wrapper below), so a previous
  // design's captured renders and lighting choice shouldn't carry over.
  useEffect(() => {
    setRenderShots(null);
    setLightingMode('day');
    if (tourVideoUrlRef.current) URL.revokeObjectURL(tourVideoUrlRef.current);
    setTourVideoUrl(null);
    (roomVideosRef.current || []).forEach((v) => URL.revokeObjectURL(v.url));
    setRoomVideos(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultRevision]);

  // Release the blob: URLs when the component itself unmounts (navigating away
  // mid-session) — the per-resultRevision effect above only covers switching
  // to a *different* design, not leaving the page entirely.
  useEffect(() => () => {
    if (tourVideoUrlRef.current) URL.revokeObjectURL(tourVideoUrlRef.current);
    (roomVideosRef.current || []).forEach((v) => URL.revokeObjectURL(v.url));
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleGenerate(e) {
    e.preventDefault();
    setStatus({ kind: 'loading', message: 'Generating your design…' });
    const requirements = {
      plotWidthFt: form.plotWidth,
      plotDepthFt: form.plotLength,
      budget: form.budget || undefined,
      bedrooms: form.bedrooms || undefined,
      bathrooms: form.bathrooms || undefined,
      floors: form.floors,
      parking: form.parking,
      garden: form.garden,
      style: form.style || undefined,
      kitchenType: form.kitchen || undefined,
      livingRoomSize: form.livingRoom || undefined,
      variationSeed: 0,
    };
    try {
      const design = await generateRuleBasedDesign(requirements);
      setHistory([{ layout: design, cost: design.estimated_cost, requirements, feedback: null }]);
      setHistoryIndex(0);
      setResultRevision((r) => r + 1);
      setWalkthroughOn(false);
      setChatLog([]);
      setStatus(null);
    } catch (err) {
      setStatus({ kind: 'error', message: err.message || 'Could not generate a design from those inputs.' });
    }
  }

  // "Generate Another Design": resend the SAME requirements with the variation
  // seed bumped by one. The backend's rule-based generator (never AI, never
  // random) uses that seed to pick a different — but still valid, same-plot,
  // same-room-count, same-approximate-budget — layout arrangement. See
  // VARIATION_PROFILES in designGenerator.js.
  async function handleGenerateAnother() {
    if (!activeDesign || regenerating) return;
    setRegenerating(true);
    setStatus(null);
    const requirements = {
      ...activeDesign.requirements,
      variationSeed: (Number(activeDesign.requirements.variationSeed) || 0) + 1,
    };
    try {
      const design = await generateRuleBasedDesign(requirements);
      const entry = { layout: design, cost: design.estimated_cost, requirements, feedback: null };
      setHistory((h) => [...h, entry]);
      setHistoryIndex((i) => i + 1);
      setResultRevision((r) => r + 1);
      setWalkthroughOn(false);
    } catch (err) {
      setStatus({ kind: 'error', message: err.message || 'Could not generate another design.' });
    } finally {
      setRegenerating(false);
    }
  }

  // "Make the kitchen bigger," "add one more bedroom," "move the staircase," ...
  // The server interprets the message (AI, or a keyword fallback) into a small
  // structured intent, then a deterministic engine — the same rule-based one used
  // everywhere else — turns it into a new design. A successful, actually-changed
  // result becomes a new version, exactly like "Generate Another Design."
  async function handleChatSubmit(e) {
    e.preventDefault();
    const message = chatInput.trim();
    if (!message || !activeDesign || chatBusy) return;
    setChatLog((log) => [...log, { role: 'user', text: message }]);
    setChatInput('');
    setChatBusy(true);
    try {
      const res = await chatModifyDesign({ message, requirements: activeDesign.requirements });
      if (res.changed) {
        const entry = { layout: res.layout, cost: res.cost, requirements: res.requirements, feedback: null };
        setHistory((h) => [...h, entry]);
        setHistoryIndex((i) => i + 1);
        setResultRevision((r) => r + 1);
        setWalkthroughOn(false);
      }
      setChatLog((log) => [...log, { role: 'system', text: res.message }]);
    } catch (err) {
      setChatLog((log) => [...log, { role: 'system', text: err.message || 'Could not apply that change.', error: true }]);
    } finally {
      setChatBusy(false);
    }
  }

  function setFeedback(kind) {
    setHistory((h) =>
      h.map((entry, i) => (i === historyIndex ? { ...entry, feedback: entry.feedback === kind ? null : kind } : entry))
    );
  }

  function goToVersion(i) {
    if (i < 0 || i >= history.length) return;
    setHistoryIndex(i);
    setResultRevision((r) => r + 1);
    setWalkthroughOn(false);
  }

  function handleToggleWalkthrough() {
    if (walkthroughOn) {
      viewerRef.current?.exitWalkthrough();
      setWalkthroughOn(false);
    } else {
      viewerRef.current?.enterWalkthrough();
      setWalkthroughOn(true);
    }
  }

  function handleLightingChange(mode) {
    setLightingMode(mode);
    viewerRef.current?.setLightingMode(mode);
  }

  async function handleCaptureRenders() {
    if (!viewerRef.current || capturingRenders) return;
    setCapturingRenders(true);
    try {
      const shots = await viewerRef.current.captureRenders();
      setRenderShots(shots);
    } finally {
      setCapturingRenders(false);
    }
  }

  async function handleGenerateTour() {
    if (!viewerRef.current || generatingTour) return;
    setGeneratingTour(true);
    setTourProgress('Starting…');
    try {
      const result = await viewerRef.current.generateTourVideo((label) => setTourProgress(label));
      if (result) {
        if (tourVideoUrlRef.current) URL.revokeObjectURL(tourVideoUrlRef.current);
        setTourVideoUrl(result.url);
      }
    } catch (err) {
      setStatus({ kind: 'error', message: err.message || 'Could not record a tour video in this browser.' });
    } finally {
      setGeneratingTour(false);
      setTourProgress('');
    }
  }

  async function handleGenerateRoomVideos() {
    if (!viewerRef.current || generatingRoomVideos) return;
    setGeneratingRoomVideos(true);
    setRoomVideoProgress('Starting…');
    try {
      const results = await viewerRef.current.generateRoomVideos((label) => setRoomVideoProgress(label));
      (roomVideosRef.current || []).forEach((v) => URL.revokeObjectURL(v.url));
      setRoomVideos(results);
    } catch (err) {
      setStatus({ kind: 'error', message: err.message || 'Could not record room videos in this browser.' });
    } finally {
      setGeneratingRoomVideos(false);
      setRoomVideoProgress('');
    }
  }

  async function handleSave() {
    if (!activeDesign) return;
    if (!isLoggedIn()) {
      onNavigate?.('login');
      return;
    }
    setSaveState('saving');
    try {
      await onSave({
        layout: activeDesign.layout,
        cost: activeDesign.cost,
        requirements: activeDesign.requirements,
        title: activeDesign.layout.title,
      });
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('idle');
    }
  }

  return (
    <div className="create-design">
      <form className="form-grid" onSubmit={handleGenerate}>
        <label className="field">
          <span>Plot width / frontage (ft)</span>
          <input type="number" min="10" max="300" required value={form.plotWidth} onChange={(e) => update('plotWidth', e.target.value)} placeholder="30" />
          <small className="field-hint">The side facing the road. Typical plots: 20-60 ft.</small>
        </label>
        <label className="field">
          <span>Plot length / depth (ft)</span>
          <input type="number" min="10" max="300" required value={form.plotLength} onChange={(e) => update('plotLength', e.target.value)} placeholder="40" />
          <small className="field-hint">Front-to-back distance from the road.</small>
        </label>
        <label className="field">
          <span>Budget (₹)</span>
          <input type="number" min="100000" step="10000" value={form.budget} onChange={(e) => update('budget', e.target.value)} placeholder="2500000" />
          <small className="field-hint">Optional — leave blank to skip the budget check.</small>
        </label>
        <label className="field">
          <span>Bedrooms</span>
          <input type="number" min="1" max="8" value={form.bedrooms} onChange={(e) => update('bedrooms', e.target.value)} placeholder="3" />
        </label>
        <label className="field">
          <span>Bathrooms</span>
          <input type="number" min="1" max="6" value={form.bathrooms} onChange={(e) => update('bathrooms', e.target.value)} placeholder="2" />
        </label>
        <label className="field">
          <span>Floors</span>
          <select value={form.floors} onChange={(e) => update('floors', e.target.value)}>
            <option value="1">1 (single storey)</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
          <small className="field-hint">More floors fit more rooms on a small plot.</small>
        </label>
        <label className="field">
          <span>Kitchen</span>
          <select value={form.kitchen} onChange={(e) => update('kitchen', e.target.value)}>
            <option value="">No preference</option>
            {KITCHEN_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Living room</span>
          <select value={form.livingRoom} onChange={(e) => update('livingRoom', e.target.value)}>
            <option value="">No preference</option>
            {LIVING_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className="field">
          <span>House style</span>
          <select value={form.style} onChange={(e) => update('style', e.target.value)}>
            <option value="">Any</option>
            {STYLE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className="field field-check">
          <input type="checkbox" checked={form.parking} onChange={(e) => update('parking', e.target.checked)} />
          <span>Needs covered parking (1 car)</span>
        </label>
        <label className="field field-check">
          <input type="checkbox" checked={form.garden} onChange={(e) => update('garden', e.target.checked)} />
          <span>Wants a garden / open space</span>
        </label>
        <div className="field-wide">
          <button
            className={'btn btn-primary' + (status?.kind === 'loading' ? ' btn-loading' : '')}
            type="submit"
            disabled={status?.kind === 'loading'}
          >
            {status?.kind === 'loading' ? (<><span className="spinner" /> Generating…</>) : 'Generate Design'}
          </button>
        </div>
      </form>

      {status?.kind === 'error' && (
        <div className="notice notice--error">
          <span className="notice-icon"><AlertTriangle size={22} strokeWidth={1.8} /></span>
          <div><p style={{ margin: 0 }}>{status.message}</p></div>
        </div>
      )}

      {activeDesign && (
        <div className="result" key={resultRevision}>
          <div className="result-header">
            <div>
              <h3>{activeDesign.layout.title}</h3>
              <p className="result-summary">{activeDesign.layout.summary}</p>
            </div>
            <div className="viewer-controls">
              {viewMode === '3d' && !walkthroughOn && (
                <>
                  <label><input type="checkbox" defaultChecked onChange={(e) => viewerRef.current?.setRoofVisible(e.target.checked)} /> Roof</label>
                  <label><input type="checkbox" onChange={(e) => viewerRef.current?.setWireframe(e.target.checked)} /> Wireframe</label>
                  <label className="field-inline">
                    View:
                    <select defaultValue="iso" onChange={(e) => viewerRef.current?.setCameraView(e.target.value)}>
                      <option value="iso">Isometric</option>
                      <option value="top">Top</option>
                      <option value="aerial">Aerial</option>
                      <option value="front">Front</option>
                      <option value="front-left">Front-left</option>
                      <option value="front-right">Front-right</option>
                      <option value="side">Side</option>
                      <option value="rear">Rear</option>
                      <option value="entrance">Entrance</option>
                    </select>
                  </label>
                  <label className="field-inline">
                    Floor:
                    <select defaultValue="all" onChange={(e) => viewerRef.current?.setFloorFilter(e.target.value === 'all' ? null : Number(e.target.value))}>
                      <option value="all">Complete house</option>
                      {Array.from({ length: floorCountOf(activeDesign.layout) }, (_, i) => (
                        <option key={i} value={i}>{i === 0 ? 'Ground Floor' : `Floor ${i + 1}`}</option>
                      ))}
                    </select>
                  </label>
                  <div className="lighting-toggle" role="group" aria-label="Time of day">
                    {['day', 'sunset', 'night'].map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={'lighting-toggle-btn' + (lightingMode === mode ? ' active' : '')}
                        onClick={() => handleLightingChange(mode)}
                      >
                        {mode === 'day' ? 'Day' : mode === 'sunset' ? 'Sunset' : 'Night'}
                      </button>
                    ))}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={handleToggleWalkthrough}><Footprints size={15} /> Walkthrough</button>
                  <button
                    className={'btn btn-ghost btn-sm' + (capturingRenders ? ' btn-loading' : '')}
                    onClick={handleCaptureRenders}
                    disabled={capturingRenders}
                  >
                    {capturingRenders ? (<><span className="spinner" /> Rendering…</>) : (<><Camera size={15} /> Generate Architectural Render</>)}
                  </button>
                  <button
                    className={'btn btn-ghost btn-sm' + (generatingTour ? ' btn-loading' : '')}
                    onClick={handleGenerateTour}
                    disabled={generatingTour}
                  >
                    {generatingTour ? (<><span className="spinner" /> {tourProgress || 'Recording…'}</>) : (<><Video size={15} /> Generate House Tour Video</>)}
                  </button>
                  <button
                    className={'btn btn-ghost btn-sm' + (generatingRoomVideos ? ' btn-loading' : '')}
                    onClick={handleGenerateRoomVideos}
                    disabled={generatingRoomVideos}
                  >
                    {generatingRoomVideos ? (<><span className="spinner" /> {roomVideoProgress || 'Recording…'}</>) : (<><Clapperboard size={15} /> Generate Video for Each Room</>)}
                  </button>
                </>
              )}
              {viewMode === '3d' && walkthroughOn && (
                <button className="btn btn-primary btn-sm" onClick={handleToggleWalkthrough}><X size={15} /> Exit Walkthrough (Esc)</button>
              )}
              <label>
                <input type="checkbox" checked={showElevations} onChange={(e) => setShowElevations(e.target.checked)} /> Elevations
              </label>
              <button className="btn btn-ghost btn-sm" onClick={handleSave} disabled={saveState === 'saving'}>
                {saveState === 'saved' ? 'Saved ✓' : saveState === 'saving' ? 'Saving…' : (<><Save size={15} /> Save</>)}
              </button>
              <a
                className="btn btn-ghost btn-sm"
                href="https://www.meshy.ai"
                target="_blank"
                rel="noopener noreferrer"
                title="Opens Meshy AI in a new tab — restyle a 3D model's look with an AI text prompt. This house isn't exported as a file yet, so you'll need your own model to upload there."
              >
                <Palette size={15} /> Restyle a 3D Model (Meshy AI)
              </a>
            </div>
          </div>

          <div className="builder-cta-row">
            <div>
              <strong>Love this design?</strong>
              <p>Connect with a builder who can bring it to life.</p>
            </div>
            <div className="builder-cta-actions">
              <button className="btn btn-primary" onClick={() => onFindBuilder?.(activeDesign)}>
                <Hammer size={16} /> Find a Builder for This Project
              </button>
              <BuilderQuoteForm design={activeDesign} triggerLabel="Talk to a Construction Expert" onNavigate={onNavigate} />
            </div>
          </div>

          <div className="feedback-row">
            <button
              className={'btn btn-ghost btn-sm feedback-btn' + (activeDesign.feedback === 'like' ? ' feedback-btn--like-active' : '')}
              onClick={() => setFeedback('like')}
            >
              <ThumbsUp size={15} /> Like Design
            </button>
            <button
              className={'btn btn-ghost btn-sm feedback-btn' + (activeDesign.feedback === 'dislike' ? ' feedback-btn--dislike-active' : '')}
              onClick={() => setFeedback('dislike')}
            >
              <ThumbsDown size={15} /> Don't Like
            </button>
            {isRuleBased && (
              <button
                className={'btn btn-primary btn-sm' + (regenerating ? ' btn-loading' : '')}
                type="button"
                onClick={handleGenerateAnother}
                disabled={regenerating}
              >
                {regenerating ? (<><span className="spinner" /> Generating…</>) : (<><RotateCcw size={15} /> Generate Another Design</>)}
              </button>
            )}
            {history.length > 1 && (
              <div className="version-nav">
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => goToVersion(historyIndex - 1)} disabled={historyIndex === 0}>‹</button>
                <span className="version-label">Version {historyIndex + 1} of {history.length}</span>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => goToVersion(historyIndex + 1)} disabled={historyIndex === history.length - 1}>›</button>
              </div>
            )}
          </div>

          {/* The 2D SVG floor-plan renderer is built around the rule-based generator's
              feet-based plot/wall-network shape — an uploaded-plan analysis doesn't
              produce that shape (see UploadPlan.jsx), so its tab is hidden rather than
              surfacing a misleading "geometry is invalid" error for an unsupported
              design type. */}
          {isRuleBased && (
            <div className="view-toggle">
              <button className={'tab-sm' + (viewMode === '3d' ? ' active' : '')} onClick={() => setViewMode('3d')}><Box size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />3D View</button>
              <button className={'tab-sm' + (viewMode === '2d' ? ' active' : '')} onClick={() => setViewMode('2d')}><SquarePen size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />2D Floor Plan</button>
            </div>
          )}

          {viewMode === '3d' && walkthroughOn && (
            <p className="walkthrough-hint"><Gamepad2 size={15} style={{ verticalAlign: '-3px', marginRight: 6 }} /><strong>W A S D</strong> or arrow keys to move · mouse to look around · <strong>Space</strong> / <strong>Shift</strong> for up/down · <strong>Esc</strong> to exit</p>
          )}

          {viewMode === '3d' || !isRuleBased ? (
            <div className={'viewer-wrap' + (walkthroughOn ? ' viewer-wrap--full' : '')}>
              <HouseViewer3D ref={viewerRef} layout={activeDesign.layout} height={460} onWalkthroughExit={() => setWalkthroughOn(false)} />
              {!walkthroughOn && <RoomLegend layout={activeDesign.layout} />}
            </div>
          ) : (
            <FloorPlan2D design={activeDesign.layout} />
          )}

          {renderShots && (
            <div className="render-gallery">
              <div className="render-gallery-head">
                <h4>Architectural Renders</h4>
                <button className="btn btn-ghost btn-sm" onClick={() => setRenderShots(null)}><X size={14} /> Close</button>
              </div>
              <div className="render-gallery-grid">
                {renderShots.map((shot) => (
                  <figure key={shot.label} className="render-shot">
                    <img src={shot.dataUrl} alt={`${activeDesign.layout.title} — ${shot.label} render`} />
                    <figcaption>{shot.label}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}

          {tourVideoUrl && (
            <div className="tour-video-panel">
              <div className="render-gallery-head">
                <h4>House Tour Video</h4>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    URL.revokeObjectURL(tourVideoUrl);
                    setTourVideoUrl(null);
                  }}
                >
                  <X size={14} /> Close
                </button>
              </div>
              <video controls src={tourVideoUrl} />
              <a className="btn btn-primary btn-sm" href={tourVideoUrl} download="house-tour.webm">
                <Download size={15} /> Download video (.webm)
              </a>
            </div>
          )}

          {roomVideos && roomVideos.length > 0 && (
            <div className="room-videos-panel">
              <div className="render-gallery-head">
                <h4>Room Videos</h4>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    roomVideos.forEach((v) => URL.revokeObjectURL(v.url));
                    setRoomVideos(null);
                  }}
                >
                  <X size={14} /> Close
                </button>
              </div>
              <div className="room-videos-grid">
                {roomVideos.map((v, i) => {
                  const fileSlug = v.roomName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `room-${i}`;
                  return (
                    <figure key={`${v.roomName}-${i}`} className="room-video-card">
                      <video controls src={v.url} />
                      <figcaption>{v.roomName}</figcaption>
                      <a className="btn btn-ghost btn-sm" href={v.url} download={`${fileSlug}.webm`}>
                        <Download size={14} /> Download
                      </a>
                    </figure>
                  );
                })}
              </div>
            </div>
          )}

          {showElevations && elevations && (
            <Elevation2D
              elevations={elevations}
              wallColor={elevationModel?.wallColorExterior}
              roofColor={elevationModel?.roof?.color}
              accentColor={elevationModel?.accentColor}
            />
          )}

          <CostPanel cost={activeDesign.cost} />

          {isRuleBased ? (
          <div className="chat-panel">
            <h4><MessageCircle size={17} style={{ verticalAlign: '-3px', marginRight: 6 }} />Modify with AI</h4>
            <p className="section-sub" style={{ marginTop: 0 }}>
              Type a request in plain English — e.g. "make the kitchen bigger," "add one more
              bedroom," "move the staircase," or "give me a modern design."
            </p>
            {chatLog.length > 0 && (
              <div className="chat-log">
                {chatLog.map((entry, i) => (
                  <div key={i} className={'chat-msg chat-msg--' + entry.role + (entry.error ? ' chat-msg--error' : '')}>
                    {entry.text}
                  </div>
                ))}
              </div>
            )}
            <form className="chat-input-row" onSubmit={handleChatSubmit}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder='e.g. "make the master bedroom larger"'
                disabled={chatBusy}
              />
              <button className={'btn btn-primary btn-sm' + (chatBusy ? ' btn-loading' : '')} type="submit" disabled={chatBusy || !chatInput.trim()}>
                {chatBusy ? (<><span className="spinner" /> Thinking…</>) : 'Send'}
              </button>
            </form>
          </div>
          ) : (
            <p className="section-sub" style={{ marginTop: 24 }}>
              This design came from an uploaded floor plan, so "Generate Another" and AI chat
              edits aren't available for it — those regenerate through the plot/requirements
              form instead. Start a new design from "Create New House Design" to use them.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
