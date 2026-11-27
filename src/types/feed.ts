import type { StarCosmetics } from './models';

/** Довгі відео живуть окремо: у загальній стрічці їх немає. */
export type FeedCategory = 'general' | 'polls' | 'subscriptions' | 'shorts' | 'longs';
export type FeedFilter = 'all' | FeedCategory | 'saved';

export interface FeedAuthor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isPremium: boolean;
  isVerified?: boolean;
  cosmetics?: StarCosmetics;
}

export interface FeedReaction {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface FeedPollOption {
  index: number;
  label: string;
  votes: number;
}

export interface FeedPoll {
  question: string;
  options: FeedPollOption[];
  totalVotes: number;
  myVote: number | null;
}

/** Один вкладення поста: фото або відео з тривалістю в секундах. */
export interface FeedMedia {
  type: 'image' | 'video';
  url: string;
  duration?: number | null;
}

export interface FeedPost {
  id: string;
  author: FeedAuthor;
  category: FeedCategory;
  text: string;
  /** Усі медіа поста. Старі пости мають порожній масив і читаються з imageUrl/videoUrl. */
  media: FeedMedia[];
  imageUrl: string | null;
  videoUrl: string | null;
  /** Тривалість у секундах; понад 60 — категорія «longs». */
  videoDuration: number | null;
  poll: FeedPoll | null;
  reactions: FeedReaction[];
  commentCount: number;
  /** Приватна закладка поточного користувача. */
  saved: boolean;
  createdAt: string;
}

export interface FeedComment {
  id: string;
  postId: string;
  author: FeedAuthor;
  text: string;
  createdAt: string;
}

/** Сервер вибирає безкоштовне сховище: Cloudinary або S3-сумісне (R2/B2). */
export type FeedUploadSignature = {
  provider?: 'cloudinary';
  cloudName: string;
  apiKey: string;
  timestamp: number;
  publicId: string;
  folder: string;
  signature: string;
} | {
  provider: 's3';
  uploadUrl: string;
  publicUrl: string;
  method: 'PUT';
  expiresIn: number;
};

/** Локальне вкладення в момент складання поста. */
export interface FeedMediaDraft extends FeedMedia {
  file?: File | null;
}

export interface FeedDraft {
  text: string;
  category: FeedCategory;
  /** Файли до 25 МБ і вже завантажені великі відео — все в одному масиві. */
  media?: FeedMediaDraft[];
  /** Legacy-поля для сумісності зі старим API. */
  image?: File | null;
  imageUrl?: string;
  video?: File | null;
  /** Секунди. Якщо відомо > 60, сервер поставить пост у «Довгі». */
  videoDuration?: number | null;
  videoUrl?: string;
  poll?: { question: string; options: string[] } | null;
}
