import { Briefcase, Calculator, FileText, FolderOpen, Inbox, LayoutDashboard, MessageCircle, Settings, User, UserSearch, HardHat } from 'lucide-react';

const CUSTOMER_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'my-designs', label: 'My Designs', icon: FolderOpen, match: ['my-designs', 'compare'] },
  { id: 'find-builders', label: 'Find a Builder', icon: UserSearch, match: ['find-builders', 'builder-profile'] },
  { id: 'my-enquiries', label: 'Messages', icon: MessageCircle, match: ['my-enquiries', 'my-enquiry'] },
  { id: 'my-projects', label: 'My Projects', icon: Briefcase },
  { id: 'cost-estimator', label: 'Cost Estimator', icon: Calculator },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const BUILDER_ITEMS = [
  { id: 'builder-dashboard', label: 'Inquiries', icon: Inbox },
  { id: 'find-builders', label: 'Builder Directory', icon: UserSearch, match: ['find-builders', 'builder-profile'] },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const SIDEBAR_VIEWS = [
  'dashboard', 'my-designs', 'compare', 'find-builders', 'builder-profile', 'my-enquiries', 'my-enquiry',
  'my-projects', 'cost-estimator', 'documents', 'profile', 'settings', 'builder-dashboard',
];

// Left rail for the signed-in area. On phones it collapses into a horizontally
// scrolling pill bar (see .account-sidebar in index.css) so it costs no height.
export default function AccountSidebar({ view, account, onNavigate }) {
  const items = account?.role === 'builder' ? BUILDER_ITEMS : CUSTOMER_ITEMS;
  return (
    <aside className="account-sidebar">
      <nav className="account-sidebar-nav">
        {items.map((item) => {
          const active = item.match ? item.match.includes(view) : view === item.id;
          return (
            <button key={item.id} className={'sidebar-item' + (active ? ' active' : '')} onClick={() => onNavigate(item.id)}>
              <item.icon size={17} strokeWidth={1.9} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      {account?.role !== 'builder' && (
        <div className="sidebar-promo">
          <span className="sidebar-promo-icon"><HardHat size={22} strokeWidth={1.7} /></span>
          <strong>Are you a Builder or Civil Engineer?</strong>
          <p>Join the platform and get project enquiries from customers.</p>
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate('become-builder')}>Register Now</button>
        </div>
      )}
    </aside>
  );
}
