import { BadgeCheck, Box, Handshake, Briefcase, CircleDollarSign, HelpCircle, LogIn, PencilRuler, Calculator, FileText, FolderOpen, Home, Inbox, LayoutDashboard, MessageCircle, Settings, User, UserSearch } from 'lucide-react';

const CUSTOMER_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'my-designs', label: 'My Designs', icon: FolderOpen, match: ['my-designs', 'compare'] },
  { id: 'create', label: '3D Studio', icon: Box, match: ['create', 'upload'] },
  { id: 'cost-estimator', label: 'Cost Estimation', icon: Calculator },
  { id: 'find-builders', label: 'Find Builders', icon: UserSearch, match: ['find-builders', 'builder-profile'] },
  { id: 'connections', label: 'Connections', icon: Handshake, match: ['connections', 'my-projects', 'my-enquiry'] },
  { id: 'my-enquiries', label: 'Messages', icon: MessageCircle },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const BUILDER_ITEMS = [
  { id: 'builder-dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'builder-requests', label: 'Project Requests', icon: Inbox },
  { id: 'builder-active', label: 'Active Projects', icon: Briefcase },
  { id: 'builder-messages', label: 'Messages', icon: MessageCircle },
  { id: 'builder-quotations', label: 'Quotations', icon: FileText },
  { id: 'builder-verification', label: 'Verification', icon: BadgeCheck },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const GUEST_ITEMS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'create', label: 'Design', icon: PencilRuler, match: ['create', 'upload'] },
  { id: 'cost-estimator', label: 'Cost Estimator', icon: Calculator },
  { id: 'find-builders', label: 'Find a Builder', icon: UserSearch, match: ['find-builders', 'builder-profile'] },
  { id: 'how-it-works', label: 'How It Works', icon: HelpCircle },
  { id: 'pricing', label: 'Pricing', icon: CircleDollarSign },
  { id: 'login', label: 'Sign In', icon: LogIn },
];

const ADMIN_ITEMS = [
  { id: 'admin-verifications', label: 'Verifications', icon: BadgeCheck },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const SIDEBAR_VIEWS = [
  'dashboard', 'my-designs', 'compare', 'find-builders', 'builder-profile', 'my-enquiries', 'my-enquiry',
  'my-projects', 'cost-estimator', 'documents', 'profile', 'settings', 'builder-dashboard',
];

// Dark left rail for the signed-in area: brand on top, navigation, promo card at the
// bottom. On phones it collapses into a horizontally scrolling pill bar.
export default function AccountSidebar({ view, account, onNavigate }) {
  const items = !account ? GUEST_ITEMS : account.role === 'builder' ? BUILDER_ITEMS : account.role === 'admin' ? ADMIN_ITEMS : CUSTOMER_ITEMS;
  return (
    <aside className={'account-sidebar' + (account ? '' : ' account-sidebar--guest')}>
      <button className="sidebar-brand" onClick={() => onNavigate('home')}>
        <span className="sidebar-brand-mark"><Home size={26} strokeWidth={1.8} /></span>
        <span className="sidebar-brand-text">
          <strong>BuildBridge AI</strong>
          <small>Design • Visualize • Build</small>
        </span>
      </button>
      <nav className="account-sidebar-nav">
        {items.map((item) => {
          const active = item.match ? item.match.includes(view) : view === item.id;
          return (
            <button key={item.id} className={'sidebar-item' + (active ? ' active' : '')} onClick={() => onNavigate(item.id)}>
              <item.icon size={18} strokeWidth={1.8} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      {(!account || account.role === 'customer') && (
        <div className="sidebar-promo">
          <strong>Turn Your Dream Home Into Reality</strong>
          <p>AI-powered designs, 3D visualizations and trusted builders — all in one place.</p>
          <button className="btn btn-teal btn-sm" onClick={() => onNavigate('create')}>Get Started</button>
        </div>
      )}
    </aside>
  );
}
