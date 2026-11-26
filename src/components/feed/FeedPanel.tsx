import { BarChart3, Bookmark, Film, LayoutGrid, LogOut, Moon, Plus, Sun, Users, Video } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSocket } from '../../contexts/SocketContext';
import { useAndroidBack } from '../../utils/androidBack';
import { errorMessage } from '../../utils/format';
import { EmptyState } from '../common/EmptyState';
import { Spinner } from '../common/Spinner';
import { Logo } from '../common/Logo';
import { CommentsModal } from './CommentsModal';
import { ComposePostModal } from './ComposePostModal';
import { PostCard } from './PostCard';
import { ThemeCard } from './ThemeCard';
import type { FeedAuthor, FeedFilter, FeedPost, FeedTheme } from '../../types/feed';

const filters: Array<{ value: FeedFilter; label: string; icon: LucideIcon }> = [
  { value: 'all', label: 'Усе', icon: LayoutGrid },
  { value: 'polls', label: 'Опитування', icon: BarChart3 },
  { value: 'subscriptions', label: 'Підписки', icon: Users },
  { value: 'shorts', label: 'Короткі', icon: Film },
  { value: 'longs', label: 'Довгі', icon: Video },
  { value: 'saved', label: 'Збережене', icon: Bookmark },
];

export function FeedPanel() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { socket } = useSocket();
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [themeOfDay, setThemeOfDay] = useState<FeedTheme | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [fresh, setFresh] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [commentsPost, setCommentsPost] = useState<FeedPost | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const loadIdRef = useRef(0);
  const moreBusyRef = useRef(false);
  const loadedAtRef = useRef<string | null>(null);

  const currentUser = useMemo<FeedAuthor>(() => ({
    id: user?.id ?? '',
    username: user?.username ?? '',
    displayName: user?.displayName ?? '',
    avatarUrl: user?.avatarUrl ?? null,
    // Бейдж преміум приходить з сервера: роль/верифікація, а не локальні прапори.
    isPremium: Boolean(user && (user.role !== 'user' || user.isVerified)),
    isVerified: user?.isVerified,
    cosmetics: user?.cosmetics,
  }), [user]);

  const load = useCallback(async (nextFilter: FeedFilter, before?: string) => {
    const id = ++loadIdRef.current;
    if (before) moreBusyRef.current = true; else setLoading(true);
    if (!before) setError('');
    try {
      const result = await api.feed.list(nextFilter, before ?? null, 20);
      if (id !== loadIdRef.current) return;
      setHasMore(result.hasMore);
      if (before) {
        setPosts((current) => [...current, ...result.posts.filter((post) => !current.some((item) => item.id === post.id))]);
      } else {
        setPosts(result.posts);
        setThemeOfDay(result.theme);
        loadedAtRef.current = new Date(Date.now() - 5000).toISOString();
        setFresh(false);
      }
    } catch (cause) {
      if (id === loadIdRef.current) setError(errorMessage(cause));
    } finally {
      if (id === loadIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
        moreBusyRef.current = false;
      }
    }
  }, []);

  useEffect(() => { void load(filter); }, [filter, load]);

  useEffect(() => {
    if (!socket || !user) return;
    const onNew = (payload: { authorId?: string }) => {
      if (payload.authorId !== user.id) setFresh(true);
    };
    socket.on('feed:new', onNew);
    return () => { socket.off('feed:new', onNew); };
  }, [socket, user]);

  // Резервний шлях, якщо realtime-подія не дійшла під час перепідключення.
  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => {
      const after = loadedAtRef.current;
      if (!after) return;
      void api.feed.since(after).then(({ count }) => { if (count > 0) setFresh(true); }).catch(() => undefined);
    }, 45000);
    return () => window.clearInterval(timer);
  }, [user]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading || moreBusyRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !moreBusyRef.current) {
        setLoadingMore(true);
        void load(filter, posts[posts.length - 1]?.createdAt);
      }
    }, { rootMargin: '240px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, filter, posts, load]);

  useAndroidBack(() => {
    if (commentsPost) { setCommentsPost(null); return true; }
    if (composeOpen) { setComposeOpen(false); return true; }
    if (fresh) { setFresh(false); return true; }
    return false;
  }, 160);

  function refresh() {
    void load(filter);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updatePost(updated: FeedPost) {
    setPosts((current) => current.map((post) => post.id === updated.id ? updated : post));
    setCommentsPost((current) => current?.id === updated.id ? updated : current);
  }

  async function react(postId: string, emoji: string) {
    const { post } = await api.feed.react(postId, emoji);
    updatePost(post);
  }

  async function vote(postId: string, optionIndex: number) {
    const { post } = await api.feed.vote(postId, optionIndex);
    updatePost(post);
  }

  async function save(postId: string) {
    const { saved, post } = await api.feed.save(postId);
    if (filter === 'saved' && !saved) setPosts((current) => current.filter((item) => item.id !== postId));
    else updatePost(post);
  }

  async function answerTheme(answer: string) {
    const { theme: updated } = await api.feed.answerTheme(answer);
    setThemeOfDay(updated);
  }

  async function removePost(postId: string) {
    try {
      await api.feed.remove(postId);
      setPosts((current) => current.filter((post) => post.id !== postId));
      setCommentsPost((current) => current?.id === postId ? null : current);
    } catch (cause) { setError(errorMessage(cause)); }
  }

  const emptyTitle = filter === 'saved' ? 'Ще нічого не збережено' : 'Поки що тихо';
  const emptyText = filter === 'saved'
    ? 'Натисніть закладку на будь-якому пості — він з’явиться тут. Збережене бачите тільки ви.'
    : filter === 'longs'
      ? 'Довші за хвилину відео з’являться тільки тут. У загальній стрічці — короткі.'
      : 'Тут з’являться пости спільноти. Можете почати першим — додайте думку, фото чи відео.';

  return (
    <div className="ig-shell" aria-label="Стрічка Miston">
      <header className="ig-header">
        <div className="ig-header-inner">
          <div className="flex min-w-0 items-center gap-2.5">
            <Logo compact size={32} />
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight sm:text-xl">Стрічка</h1>
              <p className="hidden text-xs text-ios-secondary sm:block">Думки, фото й настрій спільноти</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" className="ig-action" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Світла тема' : 'Темна тема'} title={theme === 'dark' ? 'Світла тема' : 'Темна тема'}>
              {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button type="button" className="ig-action hidden sm:flex" onClick={() => void logout()} aria-label="Вийти" title="Вийти">
              <LogOut size={19} />
            </button>
            <button type="button" className="primary-btn ml-1 shrink-0 px-3 sm:px-4" onClick={() => setComposeOpen(true)}><Plus size={17} /> <span className="hidden sm:inline">Новий пост</span></button>
          </div>
        </div>
        <div className="subtle-scrollbar ig-chips" role="tablist" aria-label="Фільтри стрічки">
          {filters.map(({ value, label, icon: Icon }) => (
            <button
              type="button"
              key={value}
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={`ig-chip ${filter === value ? 'ig-chip--active' : 'ig-chip--idle'}`}
            >
              <Icon size={14} fill={value === 'saved' && filter === value ? 'currentColor' : 'none'} /> {label}
            </button>
          ))}
        </div>
      </header>

      <div ref={scrollRef} className="subtle-scrollbar ig-scroll">
        <div className="ig-column">
          {fresh && (
            <button type="button" onClick={refresh} className="ig-fresh-pill" aria-label="Показати нові пости">
              <span aria-hidden="true">↑</span> Нові пости
            </button>
          )}

          {loading ? (
            <>
              <div className="ig-card h-36 animate-pulse rounded-[26px] border" aria-hidden="true" />
              {[0, 1].map((item) => <div key={item} className="ig-card h-56 animate-pulse rounded-[26px] border" aria-hidden="true" />)}
              <p className="text-center text-xs text-ios-secondary" role="status">Завантажуємо стрічку…</p>
            </>
          ) : error && posts.length === 0 ? (
            <div className="ig-card rounded-[26px] border">
              <EmptyState icon={LayoutGrid} title="Стрічку не вдалося завантажити" description={error} action={<button type="button" className="primary-btn" onClick={refresh}>Спробувати ще раз</button>} />
            </div>
          ) : (
            <>
              {filter === 'all' && themeOfDay && <ThemeCard theme={themeOfDay} onAnswer={answerTheme} />}
              {posts.length === 0 ? (
                <div className="ig-card rounded-[26px] border">
                  <EmptyState icon={filter === 'saved' ? Bookmark : LayoutGrid} title={emptyTitle} description={emptyText} action={filter === 'saved'
                    ? <button type="button" className="primary-btn" onClick={() => setFilter('all')}>Перейти до стрічки</button>
                    : <button type="button" className="primary-btn" onClick={() => setComposeOpen(true)}><Plus size={16} /> Створити пост</button>} />
                </div>
              ) : (
                posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    currentUserId={currentUser.id}
                    onReact={react}
                    onVote={vote}
                    onSave={save}
                    onComments={setCommentsPost}
                    onRemove={(id) => void removePost(id)}
                  />
                ))
              )}
              {loadingMore && <Spinner label="Завантажуємо ще…" className="py-4" />}
              <div ref={sentinelRef} className="h-px" aria-hidden="true" />
            </>
          )}
        </div>
      </div>

      <nav className="ig-bottom-nav md:hidden" aria-label="Навігація">
        <button type="button" className="ig-nav-item" onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Нагору стрічки">
          <LayoutGrid size={21} /><span>Стрічка</span>
        </button>
        <button type="button" className="ig-nav-item ig-nav-item--primary" onClick={() => setComposeOpen(true)} aria-label="Новий пост">
          <span className="ig-nav-compose"><Plus size={23} /></span><span>Створити</span>
        </button>
        <button type="button" className="ig-nav-item" onClick={() => void logout()} aria-label="Вийти">
          <LogOut size={21} /><span>Вийти</span>
        </button>
      </nav>

      <ComposePostModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        initialCategory={filter === 'polls' ? 'polls' : 'general'}
        onCreated={(post) => {
          setPosts((current) => [post, ...current.filter((item) => item.id !== post.id)]);
          refresh();
        }}
      />
      <CommentsModal
        post={commentsPost}
        currentUser={currentUser}
        onClose={() => setCommentsPost(null)}
        onCountChange={(postId, count) => setPosts((current) => current.map((post) => post.id === postId ? { ...post, commentCount: count } : post))}
      />
    </div>
  );
}
