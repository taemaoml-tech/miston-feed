import type { StarCosmetics } from './models';

/** Категорій стрічки лише три: звичайний пост, опитування й підписки. */
export type FeedCategory = 'general' | 'polls' | 'subscriptions';
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

export interface FeedPost {
  id: string;
  author: FeedAuthor;
  category: FeedCategory;
  text: string;
  imageUrl: string | null;
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

export interface FeedTheme {
  day: string;
  question: string;
  hint: string;
  answer: string | null;
  participants: number;
}

export interface FeedDraft {
  text: string;
  category: FeedCategory;
  image?: File | null;
  imageUrl?: string;
  poll?: { question: string; options: string[] } | null;
}
