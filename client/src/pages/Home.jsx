import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Box, ClipboardList, Layers, Sparkles } from 'lucide-react';
import HouseViewer3D from '../components/HouseViewer3D.jsx';
import RoomLegend from '../components/RoomLegend.jsx';
import { SAMPLE_LAYOUTS, deriveRequirementsFromLayout, areaOf, areaUnitOf, roomCountOf, floorCountOf } from '../data/samples.js';

const HERO_SAMPLE = SAMPLE_LAYOUTS.find((s) => s.id === 'modern-villa') || SAMPLE_LAYOUTS[0];

const HOW_STEPS = [
  { icon: ClipboardList, title: 'Enter your requirements', body: 'Plot size, budget, bedrooms/bathrooms, floors, and style — takes under a minute.' },
  { icon: Box, title: 'Get an instant 3D design', body: 'A rule-based engine lays out rooms, doors and windows — walk through it in 3D.' },
  { icon: Layers, title: 'Refine and compare', body: "Don't love it? Generate another version, save a few, and compare them side by side." },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] } }),
};

export default function Home({ onNavigate, savedCount, onSaveSample }) {
  const [selected, setSelected] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const reduceMotion = useReducedMotion();

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
      <section className="hero">
        <div className="hero-content">
          <motion.p className="hero-eyebrow" initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            AI-Powered Architectural Design
          </motion.p>
          <motion.h1 className="hero-title" initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.05 }}>
            Design the home<br />you've imagined.
          </motion.h1>
          <motion.p className="hero-sub" initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
            Enter your plot size, budget, room counts and style — or upload a photo of an
            existing 2D floor plan — and get back an interactive 3D house with an
            approximate construction cost.
          </motion.p>
          <motion.div className="hero-actions" initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.16 }}>
            <button className="btn btn-primary btn-lg" onClick={() => onNavigate('create')}>
              Design My Home <ArrowRight size={17} />
            </button>
            <button className="btn btn-ghost btn-lg" onClick={() => document.getElementById('hero-visual')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
              Explore 3D
            </button>
          </motion.div>
        </div>

        <motion.div
          className="hero-visual"
          id="hero-visual"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          <HouseViewer3D layout={HERO_SAMPLE.layout} height={520} autoRotate={!reduceMotion} skipIntro />
          <div className="hero-visual-badge">
            <span className="hero-visual-badge-dot" /> Live 3D preview — drag to orbit
          </div>
        </motion.div>
      </section>

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
            <span className="how-step-num"><step.icon size={17} strokeWidth={1.9} /></span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.body}</p>
            </div>
          </motion.div>
        ))}
      </section>

      <section className="stat-row">
        <div className="stat-card">
          <span className="stat-num">{savedCount}</span>
          <span className="stat-label">Saved Designs</span>
        </div>
        <div className="stat-card">
          <span className="stat-num">{SAMPLE_LAYOUTS.length}</span>
          <span className="stat-label">Sample Designs to Explore</span>
        </div>
        <div className="stat-card">
          <span className="stat-num">3</span>
          <span className="stat-label">Max Floors Supported</span>
        </div>
      </section>

      <section className="home-samples">
        <span className="section-eyebrow"><Sparkles size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />Try it now</span>
        <h3>Explore a sample design</h3>
        <p className="section-sub">
          No AI key needed yet — these presets show the 3D engine working today. Pick one to
          preview it, or save it straight to My Designs to try the compare feature.
        </p>
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

      <footer className="site-footer">
        <p>Design-assistance &amp; visualization tool only — not a substitute for a licensed architect or structural engineer.</p>
      </footer>
    </div>
  );
}
