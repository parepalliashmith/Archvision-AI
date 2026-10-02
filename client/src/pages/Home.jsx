import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, BadgeCheck, Box, Calculator, CheckCircle2, ClipboardList, Handshake, Home as HomeIcon, MapPin, Phone, Sparkles, User, UserSearch } from 'lucide-react';
import HouseViewer3D from '../components/HouseViewer3D.jsx';
import RoomLegend from '../components/RoomLegend.jsx';
import BuilderCard from '../components/BuilderCard.jsx';
import { BUILDERS } from '../data/builders.js';
import { SAMPLE_LAYOUTS, deriveRequirementsFromLayout, areaOf, areaUnitOf, roomCountOf, floorCountOf } from '../data/samples.js';
import HERO_VILLA from '../data/heroVilla.json';

const ease = [0.16, 1, 0.3, 1];

// The ten-step journey, shown as a row under the animated connection.
const JOURNEY = ['Customer', 'AI Design', '2D + 3D', 'Cost Estimate', 'Find Builder', 'Project Request', 'Builder', 'Contact', 'Quotation', 'Construction'];

const STORY = [
  { n: '01', title: 'Tell us what you want to build.', body: 'Plot size, rooms, floors, style and budget — one short form.' },
  { n: '02', title: 'AI designs your home.', body: 'A structured design is generated: rooms, walls, doors, windows, stairs. Rooms never overlap and always fit your plot.' },
  { n: '03', title: 'Explore it in 2D and 3D.', body: 'The same design becomes a floor plan and an interactive 3D house you can walk through.' },
  { n: '04', title: 'Understand the approximate cost.', body: 'A transparent rate-based estimate with a breakdown, checked against your budget.' },
  { n: '05', title: 'Find the right construction professional.', body: 'Browse builders and civil engineers by location, service and specialization.' },
  { n: '06', title: 'Send your project and connect.', body: 'The builder receives your plan, 3D model and cost. When they accept, email, phone and chat unlock for both of you.' },
  { n: '07', title: 'Turn the design into a real home.', body: 'Discuss, receive a quotation and start the project from one shared workspace.' },
];

function FlowCard({ delay, children, className = '' }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={'flow-card ' + className}
      initial={reduce ? false : { opacity: 0, y: 24, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, delay, ease }}
    >
      {children}
    </motion.div>
  );
}

function Connector({ delay }) {
  const reduce = useReducedMotion();
  return (
    <motion.svg className="flow-connector" viewBox="0 0 80 12" aria-hidden="true">
      <motion.path
        d="M2 6 H78"
        fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round"
        initial={reduce ? false : { pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.8, delay, ease: 'easeInOut' }}
      />
    </motion.svg>
  );
}

function ConnectionStory() {
  const reduce = useReducedMotion();
  const chip = (text, delay, tone = '') => (
    <motion.span
      className={'flow-chip ' + tone}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay, ease }}
    >
      <CheckCircle2 size={15} /> {text}
    </motion.span>
  );
  return (
    <section className="flow-section">
      <div className="section-head"><div>
        <span className="section-eyebrow">The bridge</span>
        <h3>From Dream Home to Real Home</h3>
        <p>We don't just help you design your home. We help you connect with the professional who can build it. The cards below are an illustration of the flow.</p>
      </div></div>

      <div className="flow-row">
        <FlowCard delay={0}>
          <span className="flow-badge"><User size={14} /> Customer</span>
          <div className="flow-avatar">R</div>
          <strong>Customer</strong>
          <small><MapPin size={11} /> Your plot and requirements</small>
          <small>Email verified · phone provided</small>
        </FlowCard>
        <Connector delay={0.5} />
        <FlowCard delay={0.6}>
          <span className="flow-badge"><Sparkles size={14} /> AI Design</span>
          <div className="flow-mini-plan"><i /><i /><i /><i /><i /></div>
          <strong>Valid layout</strong>
          <small>Rooms, doors, windows, stairs</small>
        </FlowCard>
        <Connector delay={1.1} />
        <FlowCard delay={1.2}>
          <span className="flow-badge"><Box size={14} /> 3D House</span>
          <div className="flow-mini-house"><span /><span /></div>
          <strong>Interactive 3D</strong>
          <small><Calculator size={11} /> Approximate cost</small>
        </FlowCard>
        <Connector delay={1.7} />
        <FlowCard delay={1.8} className="flow-card--builder">
          <span className="flow-badge flow-badge--builder"><HomeIcon size={14} /> Builder</span>
          <div className="flow-avatar flow-avatar--builder">B</div>
          <strong>Builder / Civil engineer</strong>
          <small><BadgeCheck size={11} /> Profile · services · locations</small>
          <small><Phone size={11} /> Contact unlocks on accept</small>
        </FlowCard>
      </div>

      <div className="flow-chips">
        {chip('Project request sent', 2.4)}
        {chip('Builder accepted', 3.0)}
        {chip('Connection established', 3.6, 'flow-chip--final')}
      </div>

      <ol className="journey">
        {JOURNEY.map((j, i) => (
          <motion.li
            key={j}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4, delay: i * 0.06, ease }}
          >
            <b>{i + 1}</b>{j}
          </motion.li>
        ))}
      </ol>
    </section>
  );
}

export default function Home({ onNavigate, savedCount, onSaveSample, onViewProfile, onContact }) {
  const [selected, setSelected] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const reduce = useReducedMotion();
  const featured = useMemo(() => BUILDERS.slice(0, 3), []);

  async function handleSave() {
    if (!selected) return;
    setSaveState('saving');
    try {
      await onSaveSample({ layout: selected.layout, cost: null, requirements: deriveRequirementsFromLayout(selected.layout), title: selected.layout.title });
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('idle');
    }
  }

  return (
    <div className="home">
      {/* HERO */}
      <section className="landing-hero">
        <div className="blueprint-grid" aria-hidden="true" />
        <div className="container landing-hero-grid">
          <div className="landing-hero-copy">
            <motion.span className="pill-tag" initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              BuildBridge AI · Customer ↔ Builder
            </motion.span>
            <motion.h1 initial={reduce ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.05, ease }}>
              Design Your Home.<br />Find Your Builder.<br /><span className="accent">Build Your Future.</span>
            </motion.h1>
            <motion.p className="landing-sub" initial={reduce ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.12, ease }}>
              Create personalized AI-powered home designs, explore them in interactive 2D and 3D, estimate construction costs, and connect with registered builders and civil engineers.
            </motion.p>
            <motion.div className="hero-actions" initial={reduce ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2, ease }}>
              <button className="btn btn-navy btn-lg" onClick={() => onNavigate('create')}>Start Designing <ArrowRight size={17} /></button>
              <button className="btn btn-ghost btn-lg" onClick={() => onNavigate('become-builder')}>I'm a Builder</button>
            </motion.div>
            <ul className="landing-points">
              <li><Sparkles size={16} /> AI home design</li>
              <li><Box size={16} /> Interactive 2D + 3D</li>
              <li><Calculator size={16} /> Cost estimate</li>
              <li><Handshake size={16} /> Connection to builders</li>
            </ul>
          </div>

          <motion.div className="landing-hero-visual" initial={reduce ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, delay: 0.1, ease }}>
            <HouseViewer3D layout={HERO_VILLA} height={540} skipIntro initialLighting="dusk" showLabels={false} frontShot />
            <span className="hero-chip hero-chip--a"><ClipboardList size={13} /> 2D plan</span>
            <span className="hero-chip hero-chip--b"><Box size={13} /> Live 3D · drag to look around</span>
            <span className="hero-chip hero-chip--c"><UserSearch size={13} /> Send it to a builder</span>
          </motion.div>
        </div>
      </section>

      <div className="container">
        <ConnectionStory />

        {/* STORY */}
        <section className="story">
          {STORY.map((s) => (
            <motion.div
              className="story-step"
              key={s.n}
              initial={reduce ? false : { opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-70px' }}
              transition={{ duration: 0.6, delay: 0.04, ease }}
            >
              <span className="story-num">{s.n}</span>
              <div><h4>{s.title}</h4><p>{s.body}</p></div>
            </motion.div>
          ))}
        </section>

        {/* TWO ROLES */}
        <section className="role-split">
          <div className="role-panel">
            <span className="bridge-badge">For customers</span>
            <h3>Plan, visualize and hire — in one place</h3>
            <ul><li>Generate and compare designs</li><li>Walk through your home in 3D</li><li>Send the design to a builder</li><li>Chat, get a quotation, start the project</li></ul>
            <button className="btn btn-navy" onClick={() => onNavigate('create')}>Start Designing <ArrowRight size={16} /></button>
          </div>
          <div className="role-panel role-panel--builder">
            <span className="bridge-badge">For builders &amp; civil engineers</span>
            <h3>Receive projects that arrive ready to review</h3>
            <ul><li>Plot, plan, 3D model and cost with every request</li><li>Accept or decline — contact unlocks on accept</li><li>Send quotations from a shared workspace</li><li>Profile with services, locations and availability</li></ul>
            <button className="btn btn-gold" onClick={() => onNavigate('become-builder')}>Register as a Builder <ArrowRight size={16} /></button>
          </div>
        </section>

        <section className="home-samples" id="samples">
          <div className="section-head">
            <div>
              <h3>Explore a sample design</h3>
              <p>Pick one to preview it in 3D, or save it to My Designs to try comparing.{savedCount > 0 ? ` You have ${savedCount} saved.` : ''}</p>
            </div>
          </div>
          <div className="sample-grid">
            {SAMPLE_LAYOUTS.map((s, i) => (
              <motion.button
                key={s.id}
                className={'sample-card' + (selected?.id === s.id ? ' active' : '')}
                onClick={() => { setSelected(s); setSaveState('idle'); }}
                initial={reduce ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, delay: i * 0.05, ease }}
                whileHover={reduce ? undefined : { y: -3 }}
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
            <motion.div className="result" initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
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
          <p>BuildBridge AI is a design-assistance and visualization tool. Designs and costs are approximate concept-stage estimates — not a substitute for a licensed architect or structural engineer.</p>
        </footer>
      </div>
    </div>
  );
}
