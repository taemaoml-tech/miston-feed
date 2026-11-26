import { BarChart3, ImagePlus, LoaderCircle, Plus, Send, Video, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { api } from '../../api';
import { assetUrl } from '../../api/client';
import type { FeedCategory, FeedDraft, FeedPost } from '../../types/feed';
import { errorMessage, formatDuration } from '../../utils/format';
import { Modal } from '../common/Modal';

const categories: Array<{ value: FeedCategory; label: string }> = [
  { value: 'general', label: 'Усі' },
  { value: 'polls', label: 'Опитування' },
  { value: 'subscriptions', label: 'Підписки' },
];

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const SHORT_VIDEO_MAX_SECONDS = 60;

export function ComposePostModal({ open, onClose, onCreated, initialCategory = 'general' }: {
  open: boolean;
  onClose: () => void;
  onCreated: (post: FeedPost) => void;
  initialCategory?: FeedCategory;
}) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState<FeedCategory>(initialCategory);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [videoProbing, setVideoProbing] = useState(false);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setText('');
    setCategory(initialCategory);
    setImage(null);
    setImagePreview(null);
    setVideo(null);
    setVideoPreview(null);
    setVideoDuration(null);
    setVideoProbing(false);
    setPollEnabled(initialCategory === 'polls');
    setQuestion('');
    setOptions(['', '']);
    setError('');
  }, [open, initialCategory]);

  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);
  useEffect(() => () => { if (videoPreview) URL.revokeObjectURL(videoPreview); }, [videoPreview]);

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImage(null);
    setImagePreview(null);
  }

  function clearVideo() {
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideo(null);
    setVideoPreview(null);
    setVideoDuration(null);
    setVideoProbing(false);
  }

  function pickImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Можна додати лише зображення.'); return; }
    if (file.size > MAX_MEDIA_BYTES) { setError('Зображення має бути не більше 25 МБ.'); return; }
    clearVideo();
    clearImage();
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
    setError('');
    event.target.value = '';
  }

  function pickVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);
    if (!isVideo) { setError('Можна додати лише відео MP4, WebM або MOV.'); return; }
    if (file.size > MAX_MEDIA_BYTES) { setError('Відео має бути не більше 25 МБ.'); return; }

    clearImage();
    clearVideo();
    const url = URL.createObjectURL(file);
    setVideo(file);
    setVideoPreview(url);
    setVideoDuration(null);
    setVideoProbing(true);
    setError('');

    // Браузер сам визначає тривалість; понад 60 с сервер поставить у «Довгі».
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    const finish = () => {
      probe.onloadedmetadata = null;
      probe.onerror = null;
      probe.removeAttribute('src');
      probe.load();
    };
    probe.onloadedmetadata = () => {
      setVideoDuration(Number.isFinite(probe.duration) && probe.duration > 0 ? Math.round(probe.duration) : null);
      setVideoProbing(false);
      finish();
    };
    probe.onerror = () => {
      setVideoDuration(null);
      setVideoProbing(false);
      finish();
    };
    probe.src = url;
    window.setTimeout(() => setVideoProbing(false), 6000);
    event.target.value = '';
  }

  const filledOptions = options.map((option) => option.trim()).filter(Boolean);
  const poll = pollEnabled && question.trim() && filledOptions.length >= 2
    ? { question: question.trim(), options: filledOptions }
    : null;
  const canPublish = Boolean(text.trim() || image || video || poll) && !busy && !videoProbing;

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!canPublish) return;
    setBusy(true);
    setError('');
    const draft: FeedDraft = {
      text: text.trim(),
      category: poll ? 'polls' : category,
      image,
      video,
      videoDuration,
      poll,
    };
    try {
      const { post } = await api.feed.create(draft);
      onCreated(post);
      onClose();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  const preview = imagePreview ? assetUrl(imagePreview) : null;
  const videoHint = videoProbing
    ? 'Визначаємо тривалість…'
    : videoDuration == null
      ? 'Тривалість невідома — відео потрапить у «Короткі»'
      : videoDuration > SHORT_VIDEO_MAX_SECONDS
        ? `${formatDuration(videoDuration)} · довге — лише у вкладці «Довгі»`
        : `${formatDuration(videoDuration)} · коротке — у загальній стрічці`;

  return (
    <Modal open={open} onClose={onClose} title="Новий пост" description="Поділіться тим, що вас надихнуло">
      <form onSubmit={publish}>
        <label className="block">
          <span className="field-label">Що нового?</span>
          <textarea className="text-input min-h-28 resize-y" value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} placeholder="Коротка думка, новина або невеликий челендж…" aria-label="Текст поста" />
          <span className="mt-1 block text-right text-[11px] text-ios-secondary">{text.length}/2000</span>
        </label>

        <div className="mt-3">
          <span className="field-label">Категорія</span>
          <div className="subtle-scrollbar flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Категорія поста">
            {categories.map((item) => (
              <button type="button" key={item.value} onClick={() => { setCategory(item.value); setPollEnabled(item.value === 'polls'); }} className={`feed-chip ${category === item.value ? 'feed-chip--active' : 'feed-chip--idle'}`} aria-pressed={category === item.value}>{item.label}</button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <label className="secondary-btn cursor-pointer">
            <ImagePlus size={16} /> {image ? 'Змінити фото' : 'Додати фото'}
            <input type="file" accept="image/*" className="hidden" onChange={pickImage} />
          </label>
          <label className="secondary-btn cursor-pointer">
            <Video size={16} /> {video ? 'Змінити відео' : 'Додати відео'}
            <input type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={pickVideo} />
          </label>
          <button type="button" className={`secondary-btn ${pollEnabled ? 'border-ios-blue/40 bg-ios-blue/10 text-ios-blue' : ''}`} onClick={() => setPollEnabled((value) => !value)} aria-pressed={pollEnabled}>
            <BarChart3 size={16} /> Опитування
          </button>
        </div>

        {preview && (
          <div className="relative mt-3">
            <img src={preview} alt="Попередній перегляд зображення" className="feed-image" />
            <button type="button" onClick={clearImage} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white" aria-label="Прибрати зображення"><X size={16} /></button>
          </div>
        )}

        {videoPreview && (
          <div className="mt-3">
            <div className="relative">
              <video src={videoPreview} controls playsInline preload="metadata" className="feed-video" aria-label="Попередній перегляд відео" />
              <button type="button" onClick={clearVideo} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white" aria-label="Прибрати відео"><X size={16} /></button>
            </div>
            <p className="mt-2 text-[11px] text-ios-secondary" aria-live="polite">{videoHint}</p>
          </div>
        )}

        {pollEnabled && (
          <div className="mt-3 rounded-2xl border border-ios-separator/12 bg-ios-fill/[0.06] p-3.5">
            <label className="block">
              <span className="field-label">Питання опитування</span>
              <input className="text-input" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={140} placeholder="Що обраємо?" aria-label="Питання опитування" />
            </label>
            <div className="mt-3 space-y-2">
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input className="text-input" value={option} onChange={(event) => setOptions((current) => current.map((item, i) => i === index ? event.target.value : item))} maxLength={80} placeholder={`Варіант ${index + 1}`} aria-label={`Варіант ${index + 1}`} />
                  {options.length > 2 && (
                    <button type="button" className="icon-btn h-9 w-9" onClick={() => setOptions((current) => current.filter((_, i) => i !== index))} aria-label={`Прибрати варіант ${index + 1}`}><X size={15} /></button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 5 && <button type="button" className="mt-2 flex items-center gap-1 text-xs font-semibold text-ios-blue" onClick={() => setOptions((current) => [...current, ''])}><Plus size={14} /> Додати варіант</button>}
          </div>
        )}

        {error && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-2 border-t border-ios-separator/10 pt-4">
          <button type="button" className="secondary-btn" onClick={onClose}>Скасувати</button>
          <button type="submit" className="primary-btn" disabled={!canPublish}>{busy ? <><LoaderCircle size={16} className="animate-spin" /> Публікуємо…</> : <><Send size={16} /> Опублікувати</>}</button>
        </div>
      </form>
    </Modal>
  );
}
