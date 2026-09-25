import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Home, LayoutDashboard, LogOut, Menu, MessageCircle, Search, Settings, User, X } from 'lucide-react';

const DESIGN_ITEMS = [
  { id: 'create', label: 'Create New Design' },
  { id: 'upload', label: 'Upload 2D Plan' },
  { id: 'cost-estimator', label: 'Cost Estimator' },
  { id: 'my-designs', label: 'My Designs' },
  { id: 'compare', label: 'Compare Designs' },
];

const LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'create', label: 'Design', menu: DESIGN_ITEMS, match: ['create', 'upload', 'cost-estimator', 'my-designs', 'compare'] },
  { id: 'find-builders', label: 'Find a Builder', match: ['find-builders', 'builder-profile'] },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'pricing', label: 'Pricing' },
];

export function displayName(account) {
  if (!account?.email) return 'Guest';
  const local = account.email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\d+$/, '').trim() || account.email;
  return local.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initialsOf(account) {
  const parts = displayName(account).split(' ').filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

// Sticky top nav: transparent over the hero, gains a blurred surface once the
// page scrolls past it. A scroll listener toggling one class is enough, since
// the threshold is a fixed pixel offset rather than "is an element visible".
export default function Navbar({ view, onNavigate, savedCount, account, onLogout }) {
  const [scrolled, setScrolled] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const designRef = useRef(null);
  const accountRef = useRef(null);

  const homeView = account?.role === 'builder' ? 'builder-dashboard' : 'dashboard';

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 8); }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      if (designRef.current && !designRef.current.contains(e.target)) setDesignOpen(false);
      if (accountRef.current && !accountRef.current.contains(e.target)) setAccountOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function go(id) {
    setMobileOpen(false);
    setDesignOpen(false);
    setAccountOpen(false);
    onNavigate(id);
  }

  return (
    <header className={'navbar' + (scrolled ? ' navbar--scrolled' : '')}>
      <div className="navbar-inner">
        <button className="navbar-brand" onClick={() => go('home')}>
          <span className="navbar-brand-mark"><Home size={20} strokeWidth={2} /></span>
          <span className="navbar-brand-text">
            <span className="navbar-brand-name">ArchVision <span className="accent">AI</span></span>
            <span className="navbar-brand-tag">Design • Visualize • Build</span>
          </span>
        </button>

        <nav className="navbar-links">
          {LINKS.map((item) => {
            const active = item.match ? item.match.includes(view) : view === item.id;
            if (!item.menu) {
              return (
                <button key={item.label} className={'navbar-link' + (active ? ' active' : '')} onClick={() => go(item.id)}>
                  {item.label}
                </button>
              );
            }
            return (
              <div key={item.label} ref={designRef} style={{ position: 'relative' }}>
                <button className={'navbar-link' + (active ? ' active' : '')} onClick={() => setDesignOpen((v) => !v)}>
                  {item.label}
                  {savedCount > 0 ? <span className="navbar-badge">{savedCount}</span> : null}
                  <ChevronDown size={14} />
                </button>
                {designOpen && (
                  <div className="navbar-more-menu">
                    {item.menu.map((m) => (
                      <button key={m.id} onClick={() => go(m.id)}>{m.label}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="navbar-actions">
          <button className="navbar-icon-btn" onClick={() => go('find-builders')} aria-label="Search builders" title="Search builders">
            <Search size={18} />
          </button>
          {account ? (
            <>
              <button
                className="navbar-icon-btn"
                onClick={() => go(account.role === 'builder' ? 'builder-dashboard' : 'my-enquiries')}
                aria-label="Messages"
                title="Messages"
              >
                <MessageCircle size={18} />
              </button>
              <div ref={accountRef} style={{ position: 'relative' }}>
                <button className="navbar-account-btn" onClick={() => setAccountOpen((v) => !v)}>
                  <span className="avatar">{initialsOf(account)}</span>
                  <span className="navbar-account-name">{displayName(account)}</span>
                  <ChevronDown size={14} />
                </button>
                {accountOpen && (
                  <div className="navbar-more-menu navbar-account-menu">
                    <div className="navbar-account-menu-head">
                      <strong>{displayName(account)}</strong>
                      <span>{account.email}</span>
                    </div>
                    <button onClick={() => go(homeView)}><LayoutDashboard size={15} /> Dashboard</button>
                    <button onClick={() => go('profile')}><User size={15} /> Profile</button>
                    <button onClick={() => go('settings')}><Settings size={15} /> Settings</button>
                    <button onClick={() => { setAccountOpen(false); onLogout(); }}><LogOut size={15} /> Log out</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <button className="navbar-signin" onClick={() => go('login')}>Sign In</button>
              <button className="btn btn-primary btn-sm navbar-cta" onClick={() => go('create')}>Start Designing</button>
            </>
          )}
          <button className="navbar-mobile-toggle" onClick={() => setMobileOpen((v) => !v)} aria-label="Menu">
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      <div className={'navbar-mobile-menu' + (mobileOpen ? ' open' : '')}>
        <button onClick={() => go('home')}>Home</button>
        {DESIGN_ITEMS.map((m) => <button key={m.id} onClick={() => go(m.id)}>{m.label}</button>)}
        <button onClick={() => go('find-builders')}>Find a Builder</button>
        <button onClick={() => go('how-it-works')}>How It Works</button>
        <button onClick={() => go('pricing')}>Pricing</button>
        {account ? (
          <>
            <button onClick={() => go(homeView)}>Dashboard</button>
            <button onClick={() => go('profile')}>Profile</button>
            <button onClick={() => go('settings')}>Settings</button>
            <button onClick={() => { setMobileOpen(false); onLogout(); }}>Log out ({account.email})</button>
          </>
        ) : (
          <button onClick={() => go('login')}>Sign In</button>
        )}
      </div>
    </header>
  );
}
