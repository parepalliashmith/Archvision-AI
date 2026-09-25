import { useCallback, useEffect, useState } from 'react';
import { LogIn } from 'lucide-react';
import Navbar from './components/Navbar.jsx';
import AccountSidebar, { SIDEBAR_VIEWS } from './components/AccountSidebar.jsx';
import Home from './pages/Home.jsx';
import CreateDesign from './pages/CreateDesign.jsx';
import UploadPlan from './pages/UploadPlan.jsx';
import MyDesigns from './pages/MyDesigns.jsx';
import CompareDesigns from './pages/CompareDesigns.jsx';
import CostEstimator from './pages/CostEstimator.jsx';
import FindBuilders from './pages/FindBuilders.jsx';
import BuilderProfile from './pages/BuilderProfile.jsx';
import BuilderReply from './pages/BuilderReply.jsx';
import MyEnquiries from './pages/MyEnquiries.jsx';
import InquiryThread from './pages/InquiryThread.jsx';
import Login from './pages/Login.jsx';
import BuilderProfileSetup from './pages/BuilderProfileSetup.jsx';
import BuilderDashboard from './pages/BuilderDashboard.jsx';
import Dashboard from './pages/Dashboard.jsx';
import HowItWorks from './pages/HowItWorks.jsx';
import Pricing from './pages/Pricing.jsx';
import MyProjects from './pages/MyProjects.jsx';
import Documents from './pages/Documents.jsx';
import Profile from './pages/Profile.jsx';
import Settings from './pages/Settings.jsx';
import { getAccount, clearSession } from './lib/auth.js';
import { listDesigns, saveDesign, deleteDesign, checkHealth } from './lib/api.js';

const PAGE_TITLES = {
  home: 'Home',
  create: 'Create New House Design',
  upload: 'Upload Existing 2D Plan',
  'my-designs': 'My Designs',
  compare: 'Compare Designs',
  'cost-estimator': 'Cost Estimator',
  'find-builders': 'Find Your Builder',
  'builder-profile': 'Builder Profile',
  'builder-reply': 'Builder Reply',
  'my-enquiries': 'My Enquiries',
  'my-enquiry': 'Conversation',
  login: 'Sign In',
  'builder-profile-setup': 'Complete Your Profile',
  'builder-dashboard': 'Builder Dashboard',
  'my-projects': 'My Projects',
  documents: 'Documents',
  profile: 'Profile',
  settings: 'Settings',
};

// Pages that carry their own heading/hero, so the generic title bar is skipped.
const OWN_HEADER_VIEWS = ['home', 'dashboard', 'how-it-works', 'pricing'];

// No router library here (see App component below) — a builder's emailed
// reply link and a customer's "new reply" email link both arrive as plain
// query params on the app's root URL, read once on first mount.
function initialViewFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const v = params.get('view');
  const inquiry = params.get('inquiry');
  const token = params.get('token');
  if (v === 'builder-reply' && inquiry && token) {
    return { view: 'builder-reply', builderReplyContext: { inquiryId: inquiry, token } };
  }
  if (v === 'my-enquiry' && inquiry) {
    return { view: 'my-enquiry', selectedInquiryId: inquiry };
  }
  return { view: 'home' };
}

// Views that require a logged-in account of a specific role — rendered as a
// shared "log in to continue" prompt instead of the page itself otherwise,
// rather than duplicating that check inside every page component.
const CUSTOMER_VIEWS = ['dashboard', 'my-designs', 'compare', 'my-enquiries', 'my-enquiry', 'my-projects', 'documents'];
const ANY_ACCOUNT_VIEWS = ['profile', 'settings'];
const BUILDER_VIEWS = ['builder-dashboard'];

// 'upload' and 'create' badges depend on whether the server actually has
// GEMINI_API_KEY set — checked once via /api/health (see aiConfigured state
// below) rather than hardcoded, so this stops being stale the moment a key
// is added without needing a copy change.
function pageBadges(aiConfigured) {
  return {
    home: aiConfigured
      ? 'Rule-based design generator + AI vision/chat connected'
      : 'Rule-based design generator connected — AI vision/chat features not yet wired',
    create: aiConfigured
      ? 'Rule-based generator (geometry) + AI chat-modify connected'
      : 'Rule-based generator connected — no LLM involved in the geometry',
    upload: aiConfigured ? 'AI plan analysis connected' : 'AI plan analysis not yet connected',
    'my-designs': 'Signed-in account required — email-OTP login, no passwords',
    compare: 'Signed-in account required — email-OTP login, no passwords',
    'cost-estimator': 'Deterministic rate-table estimator — no LLM involved',
    'find-builders': 'Curated demo directory + real signed-up builders',
    'builder-profile': 'Curated demo directory + real signed-up builders',
    'builder-reply': 'Per-inquiry access link — for curated demo builders without an account',
    'my-enquiries': 'Signed-in account required — email-OTP login, no passwords',
    'my-enquiry': 'Signed-in account required — email-OTP login, no passwords',
    login: 'Email-OTP login — no passwords, no accounts stored anywhere else',
    'builder-profile-setup': 'One-time setup for a new builder account',
    'builder-dashboard': 'Signed-in builder account required',
    'my-projects': 'Enquiries you have sent to builders',
    documents: 'Project briefs for your saved designs',
    profile: 'Your account and contact details',
    settings: 'Appearance and account',
  };
}

function LoginPrompt({ onNavigate }) {
  return (
    <div className="notice notice--pending">
      <span className="notice-icon"><LogIn size={22} strokeWidth={1.8} /></span>
      <div>
        <h4>Log in to continue</h4>
        <p>Sign in with a one-time email code to see this page.</p>
        <button className="btn btn-primary btn-sm" onClick={() => onNavigate('login')} style={{ marginTop: 8 }}>Sign In</button>
      </div>
    </div>
  );
}

export default function App() {
  const [initial] = useState(initialViewFromLocation);
  const [view, setView] = useState(initial.view);
  const [pendingView, setPendingView] = useState('home');
  const [designs, setDesigns] = useState([]);
  const [loadedDesign, setLoadedDesign] = useState(null); // { layout, cost, requirements } | null
  const [selectedIds, setSelectedIds] = useState([]);
  const [aiConfigured, setAiConfigured] = useState(false);
  // Builder marketplace (Phase 1) — same prop-drilling pattern as loadedDesign
  // above, no router to fight. builderMatchContext carries the design a
  // customer clicked "Find a Builder for This Project" from (plus the
  // location they type in on FindBuilders) so match scoring has something to
  // score against; selectedBuilderId/enquiryIntent are which profile to show
  // and which contact button (if any) to auto-open the enquiry form for.
  const [builderMatchContext, setBuilderMatchContext] = useState(null); // { design, location } | null
  const [selectedBuilderId, setSelectedBuilderId] = useState(null);
  const [enquiryIntent, setEnquiryIntent] = useState(null);
  // Messaging-thread deep links (see initialViewFromLocation above).
  const [builderReplyContext] = useState(initial.builderReplyContext || null);
  const [selectedInquiryId, setSelectedInquiryId] = useState(initial.selectedInquiryId || null);
  const [account, setAccount] = useState(getAccount);
  const [editingBuilderProfile, setEditingBuilderProfile] = useState(null);

  // Wraps setView so navigating to 'login' remembers where to return to on
  // success — the same idea as builderMatchContext's prop-drilling, just for
  // a single "come back here" view name rather than a whole design.
  function navigate(next) {
    if (next === 'become-builder') {
      // Builders sign in through the same OTP page, pre-set to the builder role.
      setPendingView('builder-dashboard');
      setView('login');
      return;
    }
    if (next === 'login' && view !== 'login') setPendingView(view);
    setView(next);
  }

  useEffect(() => { window.scrollTo(0, 0); }, [view]);

  useEffect(() => {
    checkHealth().then((data) => setAiConfigured(!!data.configured)).catch(() => {});
  }, []);
  const PAGE_BADGES = pageBadges(aiConfigured);

  const refreshDesigns = useCallback(async () => {
    if (!account || account.role !== 'customer') {
      setDesigns([]);
      return;
    }
    try {
      const data = await listDesigns();
      setDesigns(data.designs || []);
    } catch {
      setDesigns([]);
    }
  }, [account]);

  useEffect(() => {
    refreshDesigns();
  }, [refreshDesigns]);

  async function handleSave({ layout, cost, requirements, title }) {
    await saveDesign({ layout, cost, requirements, title });
    await refreshDesigns();
  }

  async function handleDelete(id) {
    await deleteDesign(id);
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    await refreshDesigns();
  }

  function handleLoad(design) {
    setLoadedDesign(design);
    setView('create');
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleFindBuilder(design) {
    setBuilderMatchContext({ design, location: '' });
    setView('find-builders');
  }

  function handleViewBuilderProfile(builderId) {
    setSelectedBuilderId(builderId);
    setEnquiryIntent(null);
    setView('builder-profile');
  }

  function handleContactBuilder(builderId) {
    setSelectedBuilderId(builderId);
    setEnquiryIntent('contact');
    setView('builder-profile');
  }

  function handleLoginSuccess({ account: newAccount, needsBuilderProfile }) {
    setAccount(newAccount);
    if (needsBuilderProfile) {
      setView('builder-profile-setup');
    } else {
      const back = pendingView && pendingView !== 'home' && pendingView !== 'login' ? pendingView : 'dashboard';
      setView(newAccount.role === 'builder' ? 'builder-dashboard' : back);
    }
  }

  function handleLogout() {
    clearSession();
    setAccount(null);
    setDesigns([]);
    setView('home');
  }

  const needsCustomerLogin = (CUSTOMER_VIEWS.includes(view) && (!account || account.role !== 'customer'))
    || (ANY_ACCOUNT_VIEWS.includes(view) && !account);
  const needsBuilderLogin = BUILDER_VIEWS.includes(view) && (!account || account.role !== 'builder');

  const bleed = view === 'home';
  const withSidebar = !!account && SIDEBAR_VIEWS.includes(view) && !needsCustomerLogin && !needsBuilderLogin;

  const pages = needsCustomerLogin || needsBuilderLogin ? (
    <LoginPrompt onNavigate={navigate} />
  ) : (
    <>
      {view === 'home' && (
        <Home
          onNavigate={navigate}
          savedCount={designs.length}
          onSaveSample={handleSave}
          onViewProfile={handleViewBuilderProfile}
          onContact={handleContactBuilder}
        />
      )}
      {view === 'dashboard' && (
        <Dashboard
          account={account}
          designs={designs}
          onNavigate={navigate}
          onLoad={handleLoad}
          onViewProfile={handleViewBuilderProfile}
          onContact={handleContactBuilder}
        />
      )}
      {view === 'how-it-works' && <HowItWorks onNavigate={navigate} />}
      {view === 'pricing' && <Pricing onNavigate={navigate} />}
      {view === 'create' && (
        <CreateDesign loadedDesign={loadedDesign} onSave={handleSave} onFindBuilder={handleFindBuilder} onNavigate={navigate} />
      )}
      {view === 'upload' && <UploadPlan onSave={handleSave} onFindBuilder={handleFindBuilder} onNavigate={navigate} />}
      {view === 'my-designs' && (
        <MyDesigns
          designs={designs}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onLoad={handleLoad}
          onDelete={handleDelete}
          onGoCompare={() => setView('compare')}
          onNavigate={navigate}
        />
      )}
      {view === 'compare' && (
        <CompareDesigns
          designs={designs}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onGoMyDesigns={() => setView('my-designs')}
          onNavigate={navigate}
        />
      )}
      {view === 'cost-estimator' && <CostEstimator />}
      {view === 'find-builders' && (
        <FindBuilders
          matchContext={builderMatchContext}
          onViewProfile={handleViewBuilderProfile}
          onContact={handleContactBuilder}
        />
      )}
      {view === 'builder-profile' && (
        <BuilderProfile
          builderId={selectedBuilderId}
          design={builderMatchContext?.design}
          initialIntent={enquiryIntent}
          onBack={() => setView('find-builders')}
          onNavigate={navigate}
        />
      )}
      {view === 'builder-reply' && (
        <BuilderReply
          inquiryId={builderReplyContext?.inquiryId}
          token={builderReplyContext?.token}
          onNavigateHome={() => setView('home')}
        />
      )}
      {view === 'my-enquiries' && (
        <MyEnquiries
          onOpen={(id) => { setSelectedInquiryId(id); setView('my-enquiry'); }}
          onNavigate={navigate}
        />
      )}
      {view === 'my-enquiry' && (
        <InquiryThread
          inquiryId={selectedInquiryId}
          onBack={() => setView('my-enquiries')}
        />
      )}
      {view === 'my-projects' && (
        <MyProjects onOpen={(id) => { setSelectedInquiryId(id); setView('my-enquiry'); }} onNavigate={navigate} />
      )}
      {view === 'documents' && <Documents designs={designs} onNavigate={navigate} />}
      {view === 'profile' && (
        <Profile
          account={account}
          onAccountChange={setAccount}
          onEditBuilder={(bp) => { setEditingBuilderProfile(bp); setView('builder-profile-setup'); }}
        />
      )}
      {view === 'settings' && <Settings account={account} onLogout={handleLogout} />}
      {view === 'login' && (
        <Login defaultRole={pendingView === 'builder-dashboard' ? 'builder' : 'customer'} onSuccess={handleLoginSuccess} />
      )}
      {view === 'builder-profile-setup' && (
        <BuilderProfileSetup initial={editingBuilderProfile} onDone={() => { setEditingBuilderProfile(null); setView('builder-dashboard'); }} />
      )}
      {view === 'builder-dashboard' && <BuilderDashboard />}
    </>
  );

  const header = !OWN_HEADER_VIEWS.includes(view) && (
    <header className="page-header">
      <h1>{PAGE_TITLES[view]}</h1>
      <span className="page-header-badge">{PAGE_BADGES[view]}</span>
    </header>
  );

  return (
    <div className="app-shell">
      <Navbar view={view} onNavigate={navigate} savedCount={designs.length} account={account} onLogout={handleLogout} />
      <main className={'main' + (bleed ? ' main--bleed' : '')}>
        {withSidebar ? (
          <div className="account-layout">
            <AccountSidebar view={view} account={account} onNavigate={navigate} />
            <div className="account-content">
              {header}
              <div className="page page-enter" key={view}>{pages}</div>
            </div>
          </div>
        ) : (
          <>
            {header}
            <div className={'page page-enter' + (bleed ? ' page--bleed' : '')} key={view}>{pages}</div>
          </>
        )}
      </main>
    </div>
  );
}
