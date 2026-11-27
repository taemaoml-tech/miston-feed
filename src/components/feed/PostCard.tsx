import { Bookmark, ChevronLeft, ChevronRight, Crown, MessageCircle, MoreHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { assetUrl } from '../../api/client';
import type { FeedMedia, FeedPost } from '../../types/feed';
import { formatConversationTime, formatDuration } from '../../utils/format';
import { Avatar } from '../common/Avatar';
import { PollWidget } from './PollWidget';

const categoryLabels: Record<FeedPost['category'], string> = {
  general: 'Пост',
  polls: 'Опитування',
  subscriptions: 'Підписки',
  shorts: 'Коротке відео',
  longs: 'Довге відео',
};

const reactions = ['❤️', '🔥', '👏', '😂', '💡', '✨'];

function mediaFor(post: FeedPost): FeedMedia[] {
  if (post.media?.length) return post.media;
  const legacy: FeedMedia[] = [];
  if (post.imageUrl) legacy.push({ type: 'image', url: post.imageUrl });
  if (post.videoUrl) legacy.push({ type: 'video', url: post.videoUrl, duration: post.videoDuration });
  return legacy;
}

interface PostCardProps {
  post: FeedPost;
  currentUserId: string;
  onReact: (postId: string, emoji: string) => Promise<void>;
  onVote: (postId: string, optionIndex: number) => Promise<void>;
  onSave: (postId: string) => Promise<void>;
  onComments: (post: FeedPost) => void;
  onRemove?: (postId: string) => void;
}

export function PostCard({ post, currentUserId, onReact, onVote, onSave, onComments, onRemove }: PostCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  const isMine = post.author.id === currentUserId;
  const liked = post.reactions.some((reaction) => reaction.emoji === '❤️' && reaction.mine);
  const total = post.reactions.reduce((sum, reaction) => sum + reaction.count, 0);
  const media = mediaFor(post);
  const active = media[Math.min(mediaIndex, media.length - 1)];
  const activeUrl = active ? assetUrl(active.url) : null;

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await action(); }
    finally { setBusy(false); }
  }

  function step(delta: number) {
    if (media.length < 2) return;
    setMediaIndex((current) => (current + delta + media.length) % media.length);
  }

  return (
    <article className="ig-card feed-post-enter overflow-hidden rounded-[26px] border" aria-label={`Пост від ${post.author.displayName}`}>
      <header className="flex items-start gap-3 px-4 pt-4 sm:px-5">
        <span className="ig-avatar-ring shrink-0">
          <Avatar name={post.author.displayName} src={post.author.avatarUrl} cosmetics={post.author.cosmetics} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-bold">{post.author.displayName}</span>
            {post.author.isPremium ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-100 to-yellow-200 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:from-amber-500/25 dark:to-yellow-500/20 dark:text-amber-200">
                <Crown size={11} /> Преміум
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                <span aria-hidden="true">💛</span> Крута людина
              </span>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-ios-secondary">
            <span>@{post.author.username}</span><span aria-hidden="true">·</span>
            <time dateTime={post.createdAt}>{formatConversationTime(post.createdAt)}</time>
            <span aria-hidden="true">·</span><span>{categoryLabels[post.category]}</span>
          </p>
        </div>
        {isMine && onRemove && (
          <div className="relative shrink-0">
            <button type="button" className="ig-action" onClick={() => setMenuOpen((value) => !value)} aria-label="Дії з постом" aria-expanded={menuOpen}><MoreHorizontal size={19} /></button>
            {menuOpen && (
              <>
                <button type="button" className="fixed inset-0 z-10 cursor-default" aria-label="Закрити меню" onClick={() => setMenuOpen(false)} />
                <button type="button" className="absolute right-0 top-10 z-20 flex items-center gap-2 rounded-xl border bg-ios-bg px-3 py-2 text-xs font-medium text-rose-600 shadow-lg" onClick={() => { setMenuOpen(false); onRemove(post.id); }}>
                  <Trash2 size={14} /> Видалити пост
                </button>
              </>
            )}
          </div>
        )}
      </header>

      {post.text && <p className="whitespace-pre-wrap break-words px-4 pt-3 text-sm leading-relaxed text-ios-label sm:px-5">{post.text}</p>}

      {activeUrl && (
        <div className="ig-media-stage mt-3">
          {active?.type === 'video' ? (
            <div className="ig-video-wrap">
              <video src={activeUrl} controls playsInline preload="metadata" className="ig-video" aria-label={post.text ? 'Відео до поста' : 'Відео в пості'} />
              {active.duration != null && <span className="ig-video-duration">{formatDuration(active.duration)}</span>}
            </div>
          ) : (
            <img src={activeUrl} alt={post.text ? 'Зображення до поста' : 'Зображення в пості'} className="ig-image" loading="lazy" />
          )}
          {media.length > 1 && (
            <>
              <button type="button" className="ig-media-arrow ig-media-arrow--left" onClick={() => step(-1)} aria-label="Попереднє медіа"><ChevronLeft size={20} /></button>
              <button type="button" className="ig-media-arrow ig-media-arrow--right" onClick={() => step(1)} aria-label="Наступне медіа"><ChevronRight size={20} /></button>
              <span className="ig-media-count">{Math.min(mediaIndex, media.length - 1) + 1} / {media.length}</span>
              <div className="ig-media-dots" aria-hidden="true">
                {media.map((item, index) => <span key={`${item.url}-${index}`} className={index === Math.min(mediaIndex, media.length - 1) ? 'is-active' : ''} />)}
              </div>
            </>
          )}
        </div>
      )}

      {post.poll && <div className="px-4 sm:px-5"><PollWidget poll={post.poll} onVote={(index) => onVote(post.id, index)} /></div>}

      <footer className="mt-3 flex items-center gap-1 px-3 pb-3 sm:px-4">
        <button
          type="button"
          onClick={() => void run(() => onReact(post.id, '❤️'))}
          disabled={busy}
          aria-label={liked ? 'Прибрати лайк' : 'Поставити лайк'}
          aria-pressed={liked}
          className={`ig-action ${liked ? 'text-rose-500' : ''}`}
        >
          <span aria-hidden="true" className="text-xl leading-none">{liked ? '❤️' : '🤍'}</span>
          {total > 0 && <span className="ml-1 text-xs font-semibold">{total}</span>}
        </button>

        <div className="relative">
          <button type="button" className="ig-action" onClick={() => setPickerOpen((value) => !value)} aria-label="Додати реакцію" aria-expanded={pickerOpen}>
            <span aria-hidden="true" className="text-lg leading-none">☺</span>
          </button>
          {pickerOpen && (
            <>
              <button type="button" className="fixed inset-0 z-10 cursor-default" aria-label="Закрити реакції" onClick={() => setPickerOpen(false)} />
              <div className="absolute bottom-11 left-0 z-20 flex gap-1 rounded-2xl border bg-ios-bg p-1.5 shadow-xl animate-fade-in">
                {reactions.map((emoji) => (
                  <button type="button" key={emoji} disabled={busy} onClick={() => { setPickerOpen(false); void run(() => onReact(post.id, emoji)); }} className="flex h-8 w-8 items-center justify-center rounded-xl text-lg transition hover:scale-110 hover:bg-ios-fill/10" aria-label={`Реакція ${emoji}`}>{emoji}</button>
                ))}
              </div>
            </>
          )}
        </div>

        <button type="button" onClick={() => onComments(post)} className="ig-action" aria-label={`Відкрити коментарі: ${post.commentCount}`}>
          <MessageCircle size={20} />
          {post.commentCount > 0 && <span className="ml-1 text-xs font-semibold">{post.commentCount}</span>}
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => void run(() => onSave(post.id))}
            disabled={busy}
            aria-label={post.saved ? 'Прибрати зі збереженого' : 'Зберегти пост'}
            aria-pressed={post.saved}
            className={`ig-action ${post.saved ? 'ig-action--saved' : ''}`}
          >
            <Bookmark size={20} fill={post.saved ? 'currentColor' : 'none'} />
          </button>
        </div>
      </footer>
    </article>
  );
}
