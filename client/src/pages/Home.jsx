import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Box, Calculator, ClipboardList, Handshake, Layers, Sparkles, Users } from 'lucide-react';
import HouseViewer3D from '../components/HouseViewer3D.jsx';
import RoomLegend from '../components/RoomLegend.jsx';
import BuilderCard from '../components/BuilderCard.jsx';
import { BUILDERS } from '../data/builders.js';
import { SAMPLE_LAYOUTS, deriveRequirementsFromLayout, areaOf, areaUnitOf, roomCountOf, floorCountOf } from '../data/samples.js';
import { getPlotSize } from '../lib/layout.js';

const HERO_SAMPLE = SAMPLE_LAYOUTS.find((s) => s.id === 'modern-villa') || SAMPLE_LAYOUTS[0];

const FEATURES = [
  { icon: Sparkles, title: 'AI-Powered', body: 'Designs' },
  { icon: Box, title: '3D Visualization', body: '& Walkthrough' },
  { icon: Users, title: 'Builders &', body: 'Engineers' },
  { icon: Calculator, title: 'Cost', body: 'Estimate' },
];

const HOW_STEPS = [
  { icon: ClipboardList, title: 'Enter your requirements', body: 'Plot size, budget, bedrooms/bathrooms, floors, and style — takes under a minute.' },
  { icon: Box, title: 'Get an instant 3D design', body: 'A rule-based engine lays out rooms, doors and windows — walk through it in 3D.' },
  { icon: Layers, title: 'Refine and compare', body: "Don't love it? Generate another version, save a few, and compare them side by side." },
  { icon: Handshake, title: 'Connect with a builder', body: 'Send your design as an enquiry and talk by email and phone.' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] } }),
};

export default function Home({ onNavigate, savedCount, onSaveSample, onViewProfile, onContact }) {
  const [selected, setSelected] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const reduceMotion = useReducedMotion();
  const featured = useMemo(() => BUILDERS.slice(0, 3), []);
  const heroPlot = getPlotSize(HERO_SAMPLE.layout);

  async function handleSave() {
    if (!selected) return;
    setSaveState('saving');
    try {
      await onSaveSample({
        layout: selected.layout,
        cost: null,
        requirements: deriveRequirementsFromLayout(selected.layout),
        title: selected.layout.title,
      });
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('idle');
    }
  }

  return (
    <div className="home">
      <section className="home-hero">
        <div className="container home-hero-grid">
          <div className="home-hero-copy">
            <motion.span className="pill-tag" initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              AI-powered home design &amp; builder connect
            </motion.span>
            <motion.h1 className="hero-title" initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.05 }}>
              From Dream to<br />Your New Home
            </motion.h1>
            <motion.p className="hero-sub" initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
              Design your home with AI, visualize it in 3D, get an estimated cost, and connect with
              builders &amp; civil engineers by email and phone — all in one place.
            </motion.p>
            <motion.div className="hero-actions" initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.16 }}>
              <button className="btn btn-primary btn-lg" onClick={() => onNavigate('create')}>
                Start Designing <ArrowRight size={17} />
              </button>
              <button className="btn btn-ghost btn-lg" onClick={() => onNavigate('find-builders')}>
                Find a Builder
              </button>
            </motion.div>
            <ul className="feature-strip">
              {FEATURES.map((f) => (
                <li key={f.title}>
                  <f.icon size={22} strokeWidth={1.6} />
                  <span><strong>{f.title}</strong><small>{f.body}</small></span>
                </li>
              ))}
            </ul>
          </div>

          <motion.div
            className="home-hero-visual"
            id="hero-visual"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <HouseViewer3D layout={HERO_SAMPLE.layout} height={520} autoRotate={!reduceMotion} skipIntro />
            <div className="hero-visual-badge">
              <span className="hero-visual-badge-dot" /> Live 3D preview — drag to orbit
            </div>
            <div className="hero-float-card">
              <strong>{HERO_SAMPLE.layout.title || HERO_SAMPLE.label}</strong>
              <dl>
                <dt>Plot</dt><dd>{heroPlot.width} × {heroPlot.depth} {heroPlot.unit}</dd>
                <dt>Built-up area</dt><dd>{areaOf(HERO_SAMPLE.layout)} {areaUnitOf(HERO_SAMPLE.layout)}</dd>
              </dl>
              <button className="link-btn" onClick={() => { setSelected(HERO_SAMPLE); document.getElementById('samples')?.scrollIntoView({ behavior: 'smooth' }); }}>
                Explore design <ArrowRight size={13} />
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="container">
        <section className="how-it-works" id="how-it-works">
          {HOW_STEPS.map((step, i) => (
            <motion.div
              className="how-step"
              key={step.title}
              variants={fadeUp}
              custom={i}
              initial={reduceMotion ? false : 'hidden'}
              whileInView="show"
              viewport={{ once: true, margin: '-60px' }}
            >
              <span className="how-step-num"><step.icon size={18} strokeWidth={1.8} /></span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </div>
            </motion.div>
          ))}
        </section>

        <section className="connect-banner connect-banner--wide">
          <div>
            <h3>Connect with Builders &amp; Civil Engineers</h3>
            <p>Sign in with a one-time email code, send your design, and see each other's verified email and registered phone — call or WhatsApp right from the page.</p>
          </div>
          <div className="hero-actions">
            <button className="btn btn-gold" onClick={() => onNavigate('find-builders')}>Find Builders <ArrowRight size={15} /></button>
            <button className="btn btn-outline-light" onClick={() => onNavigate('become-builder')}>Register as a Builder</button>
          </div>
        </section>

        <section className="home-samples" id="samples">
          <div className="section-head">
            <div>
              <h3>Explore a sample design</h3>
              <p>Pick one to preview it in 3D, or save it to My Designs to try the compare feature.{savedCount > 0 ? ` You have ${savedCount} saved.` : ''}</p>
            </div>
          </div>
          <div className="sample-grid">
            {SAMPLE_LAYOUTS.map((s, i) => (
              <motion.button
                key={s.id}
                className={'sample-card' + (selected?.id === s.id ? ' active' : '')}
                onClick={() => { setSelected(s); setSaveState('idle'); }}
                variants={fadeUp}
                custom={i}
                initial={reduceMotion ? false : 'hidden'}
                whileInView="show"
                viewport={{ once: true, margin: '-40px' }}
                whileHover={reduceMotion ? undefined : { y: -3 }}
              >
                <strong>{s.label}</strong>
                <span>
                  {s.layout.widthMeters}m × {s.layout.depthMeters}m · {roomCountOf(s.layout)} rooms
                  {floorCountOf(s.layout) > 1 ? ` · ${floorCountOf(s.layout)} floors` : ''}
                </span>
              </motion.button>
            ))}
          </div>

          {selected && (
            <motion.div className="result" initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <div className="result-header">
                <div>
                  <h3>{selected.layout.title}</h3>
                  <p className="result-summary">{selected.layout.summary}</p>
                  <p className="result-summary">{areaOf(selected.layout)} {areaUnitOf(selected.layout)} total built-up area</p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saveState === 'saving'}>
                  {saveState === 'saved' ? 'Saved ✓' : saveState === 'saving' ? 'Saving…' : 'Save to My Designs'}
                </button>
              </div>
              <div className="viewer-wrap">
                <HouseViewer3D layout={selected.layout} height={380} skipIntro />
                <RoomLegend layout={selected.layout} />
              </div>
            </motion.div>
          )}
        </section>

        <section className="home-featured">
          <div className="section-head">
            <div><h3>Featured Builders</h3><p>Sample profiles — sign-ups from real builders appear in the full directory</p></div>
            <button className="link-btn" onClick={() => onNavigate('find-builders')}>View All <ArrowRight size={13} /></button>
          </div>
          <div className="builder-grid">
            {featured.map((b) => (
              <BuilderCard key={b.id} entry={b} match={null} onViewProfile={onViewProfile} onContact={onContact} />
            ))}
          </div>
        </section>

        <footer className="site-footer">
          <p>Design-assistance &amp; visualization tool only — not a substitute for a licensed architect or structural engineer.</p>
        </footer>
      </div>
    </div>
  );
}
