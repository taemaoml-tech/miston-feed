import { BarChart3, Bookmark, Film, LayoutGrid, LogOut, MessageCircle, Moon, Plus, Sun, Users, Video } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import type { FeedFilter } from '../../types/feed';
import { Avatar } from '../common/Avatar';
import { Logo } from '../common/Logo';

export const feedFilters: Array<{ value: FeedFilter; label: string; icon: LucideIcon }> = [
  { value: 'all', label: 'Усе', icon: LayoutGrid },
  { value: 'polls', label: 'Опитування', icon: BarChart3 },
  { value: 'subscriptions', label: 'Підписки', icon: Users },
  { value: 'shorts', label: 'Короткі', icon: Film },
  { value: 'longs', label: 'Довгі', icon: Video },
  { value: 'saved', label: 'Збережене', icon: Bookmark },
];

export function FeedSidebar({ filter, onFilter, onCompose, onChat, chatOpen }: {
  filter: FeedFilter;
  onFilter: (next: FeedFilter) => void;
  onCompose: () => void;
  onChat: () => void;
  chatOpen: boolean;
}) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className="ig-sidebar" aria-label="Головна навігація стрічки">
      <div className="ig-sidebar-brand"><Logo size={34} /><span className="text-base font-bold tracking-tight">Miston</span></div>

      <button type="button" className="primary-btn ig-sidebar-compose" onClick={onCompose}><Plus size={18} /> Новий пост</button>

      <nav className="ig-sidebar-nav" role="tablist" aria-label="Фільтри стрічки">
        {feedFilters.map(({ value, label, icon: Icon }) => (
          <button
            type="button"
            key={value}
            role="tab"
            aria-selected={filter === value && !chatOpen}
            onClick={() => onFilter(value)}
            className={`ig-sidebar-item ${filter === value && !chatOpen ? 'ig-sidebar-item--active' : ''}`}
          >
            <Icon size={19} fill={value === 'saved' && filter === value ? 'currentColor' : 'none'} />
            <span>{label}</span>
          </button>
        ))}
        <button type="button" className={`ig-sidebar-item ${chatOpen ? 'ig-sidebar-item--active' : ''}`} onClick={onChat} aria-pressed={chatOpen}>
          <MessageCircle size={19} />
          <span>Чат</span>
        </button>
      </nav>

      <div className="ig-sidebar-footer">
        <button type="button" className="ig-sidebar-item" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Світла тема' : 'Темна тема'}>
          {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
          <span>{theme === 'dark' ? 'Світла тема' : 'Темна тема'}</span>
        </button>
        {user && (
          <div className="ig-sidebar-user">
            <Avatar name={user.displayName || user.username} src={user.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold">{user.displayName || user.username}</span>
            <button type="button" className="ig-action" onClick={() => void logout()} aria-label="Вийти" title="Вийти"><LogOut size={17} /></button>
          </div>
        )}
      </div>
    </aside>
  );
}
