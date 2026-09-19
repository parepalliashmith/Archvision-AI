import { useEffect, useRef, useState } from 'react';
import { Box, ChevronDown, LogOut, Menu, X } from 'lucide-react';

const PRIMARY_ITEMS = [
  { id: 'create', label: 'Design' },
  { id: 'home', label: 'How It Works', anchor: '#how-it-works' },
  { id: 'create', label: '3D Studio', key: '3d-studio' },
  { id: 'my-designs', label: 'My Designs' },
  { id: 'find-builders', label: 'Builders' },
];

const MORE_ITEMS = [
  { id: 'upload', label: 'Upload 2D Plan' },
  { id: 'compare', label: 'Compare Designs' },
  { id: 'cost-estimator', label: 'Cost Estimator' },
  { id: 'my-enquiries', label: 'My Enquiries' },
];

// Sticky top nav: transparent over the hero, gains a blurred surface once the
// page scrolls past it. Kept intentionally simple (a scroll listener toggling
// one class) rather than IntersectionObserver, since the threshold is a fixed
// pixel offset, not "is a specific element visible."
export default function Navbar({ view, onNavigate, savedCount, account, onLogout }) {
  const [scrolled, setScrolled] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const moreRef = useRef(null);

  const moreItems = account?.role === 'builder'
    ? [...MORE_ITEMS, { id: 'builder-dashboard', label: 'Builder Dashboard' }]
    : MORE_ITEMS;

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 8); }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function go(id, anchor) {
    setMobileOpen(false);
    setMoreOpen(false);
    if (id === 'home' && anchor && view === 'home') {
      document.querySelector(anchor)?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    onNavigate(id);
    if (anchor) setTimeout(() => document.querySelector(anchor)?.scrollIntoView({ behavior: 'smooth' }), 60);
  }

  return (
    <header className={'navbar' + (scrolled ? ' navbar--scrolled' : '')}>
      <div className="navbar-inner">
        <button className="navbar-brand" onClick={() => go('home')}>
          <span className="navbar-brand-mark"><Box size={16} strokeWidth={2.2} /></span>
          <span>ArchVision <span className="accent">AI</span></span>
        </button>

        <nav className="navbar-links">
          {PRIMARY_ITEMS.map((item) => (
            <button
              key={item.key || item.id}
              className={'navbar-link' + (view === item.id && !item.anchor && !item.key ? ' active' : '')}
              onClick={() => go(item.id, item.anchor)}
            >
              {item.label}
              {item.id === 'my-designs' && savedCount > 0 ? <span className="navbar-badge">{savedCount}</span> : null}
            </button>
          ))}
          <div ref={moreRef} style={{ position: 'relative' }}>
            <button className="navbar-link" onClick={() => setMoreOpen((v) => !v)}>
              More <ChevronDown size={14} />
            </button>
            {moreOpen && (
              <div className="navbar-more-menu">
                {moreItems.map((item) => (
                  <button key={item.id} onClick={() => go(item.id)}>{item.label}</button>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="navbar-actions">
          {account ? (
            <div className="navbar-account">
              <span className="navbar-account-email" title={account.email}>{account.email}</span>
              <button className="navbar-signin" onClick={onLogout} title="Log out">
                <LogOut size={14} /> Log out
              </button>
            </div>
          ) : (
            <button className="navbar-signin" onClick={() => go('login')}>Sign In</button>
          )}
          <button className="btn btn-primary btn-sm navbar-cta" onClick={() => go('create')}>
            Start Designing
          </button>
          <button className="navbar-mobile-toggle" onClick={() => setMobileOpen((v) => !v)} aria-label="Menu">
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      <div className={'navbar-mobile-menu' + (mobileOpen ? ' open' : '')}>
        {PRIMARY_ITEMS.map((item) => (
          <button key={item.key || item.id} onClick={() => go(item.id, item.anchor)}>{item.label}</button>
        ))}
        {moreItems.map((item) => (
          <button key={item.id} onClick={() => go(item.id)}>{item.label}</button>
        ))}
        {account ? (
          <button onClick={onLogout}>Log out ({account.email})</button>
        ) : (
          <button onClick={() => go('login')}>Sign In</button>
        )}
      </div>
    </header>
  );
}
