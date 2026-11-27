import { BarChart3, ImagePlus, LoaderCircle, Plus, Send, Video, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { api } from '../../api';
import type { FeedCategory, FeedMediaDraft } from '../../types/feed';
import { uploadFeedVideo } from '../../utils/videoUpload';
import { errorMessage, formatDuration } from '../../utils/format';
import { Modal } from '../common/Modal';

const categories: Array<{ value: FeedCategory; label: string }> = [
  { value: 'general', label: 'Усі' },
  { value: 'polls', label: 'Опитування' },
  { value: 'subscriptions', label: 'Підписки' },
];

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const DIRECT_UPLOAD_THRESHOLD = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
const SHORT_VIDEO_MAX_SECONDS = 60;
const MAX_MEDIA = 10;

interface LocalAttachment {
  id: string;
  type: 'image' | 'video';
  file: File;
  preview: string;
  duration: number | null;
  probing: boolean;
}

function nextId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/** Браузер сам визначає тривалість; понад 60 с сервер поставить у «Довгі». */
function probeVideo(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const probe = document.createElement('video');
    let done = false;
    const finish = (value: number | null) => {
      if (done) return;
      done = true;
      probe.onloadedmetadata = null;
      probe.onerror = null;
      probe.removeAttribute('src');
      probe.load();
      resolve(value);
    };
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => finish(Number.isFinite(probe.duration) && probe.duration > 0 ? Math.round(probe.duration) : null);
    probe.onerror = () => finish(null);
    probe.src = url;
    window.setTimeout(() => finish(null), 6000);
  });
}

export function ComposePostModal({ open, onClose, onCreated, initialCategory = 'general' }: {
  open: boolean;
  onClose: () => void;
  onCreated: (post: import('../../types/feed').FeedPost) => void;
  initialCategory?: FeedCategory;
}) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState<FeedCategory>(initialCategory);
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadLabel, setUploadLabel] = useState('');
  const [error, setError] = useState('');
  const previewUrls = useRef<Set<string>>(new Set());

  function track(url: string) {
    previewUrls.current.add(url);
    return url;
  }

  function revoke(url: string) {
    if (!previewUrls.current.delete(url)) return;
    URL.revokeObjectURL(url);
  }

  function reset() {
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
    previewUrls.current.clear();
    setText('');
    setCategory(initialCategory);
    setAttachments([]);
    setPollEnabled(initialCategory === 'polls');
    setQuestion('');
    setOptions(['', '']);
    setUploadProgress(null);
    setUploadLabel('');
    setError('');
  }

  useEffect(() => {
    if (open) reset();
    // initialCategory змінюється разом з відкриттям модалки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCategory]);

  useEffect(() => () => {
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
    previewUrls.current.clear();
  }, []);

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    setError('');
    const accepted: LocalAttachment[] = [];
    for (const file of files) {
      if (attachments.length + accepted.length >= MAX_MEDIA) {
        setError(`Можна додати не більше ${MAX_MEDIA} фото й відео в один пост.`);
        break;
      }
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);
      if (!isImage && !isVideo) {
        setError('Підтримуються лише фото та відео MP4, WebM і MOV.');
        continue;
      }
      if (isImage && file.size > MAX_IMAGE_BYTES) {
        setError('Кожне зображення має бути не більше 25 МБ.');
        continue;
      }
      if (isVideo && file.size > MAX_VIDEO_BYTES) {
        setError('Кожне відео має бути не більше 2 ГБ.');
        continue;
      }
      const preview = track(URL.createObjectURL(file));
      accepted.push({
        id: nextId(),
        type: isImage ? 'image' : 'video',
        file,
        preview,
        duration: null,
        probing: isVideo,
      });
    }
    if (!accepted.length) return;
    setAttachments((current) => [...current, ...accepted]);
    for (const item of accepted.filter((item) => item.type === 'video')) {
      const duration = await probeVideo(item.preview);
      setAttachments((current) => current.map((entry) => entry.id === item.id ? { ...entry, duration, probing: false } : entry));
    }
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const target = current.find((item) => item.id === id);
      if (target) revoke(target.preview);
      return current.filter((item) => item.id !== id);
    });
  }

  const filledOptions = options.map((option) => option.trim()).filter(Boolean);
  const poll = pollEnabled && question.trim() && filledOptions.length >= 2
    ? { question: question.trim(), options: filledOptions }
    : null;
  const probing = attachments.some((item) => item.probing);
  const canPublish = Boolean(text.trim() || attachments.length || poll) && !busy && !probing;

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!canPublish) return;
    setBusy(true);
    setError('');
    try {
      const media: FeedMediaDraft[] = [];
      for (const [index, item] of attachments.entries()) {
        if (item.type === 'video' && item.file.size > DIRECT_UPLOAD_THRESHOLD) {
          setUploadLabel(`Відео ${index + 1} з ${attachments.length}`);
          setUploadProgress(0);
          const url = await uploadFeedVideo(item.file, (fraction) => setUploadProgress(fraction));
          media.push({ type: 'video', url, duration: item.duration });
        } else {
          media.push({ type: item.type, url: '', file: item.file, duration: item.duration });
        }
      }
      const { post } = await api.feed.create({ text: text.trim(), category: poll ? 'polls' : category, media, poll });
      onCreated(post);
      onClose();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); setUploadProgress(null); setUploadLabel(''); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Новий пост" description="Поділіться тим, що вас надихнуло">
      <form onSubmit={publish}>
        <label className="block">
          <span className="field-label">Що нового?</span>
          <textarea className="text-input min-h-24 resize-y" value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} placeholder="Коротка думка, новина або невеликий челендж…" aria-label="Текст поста" />
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
            <ImagePlus size={16} /> Додати фото
            <input type="file" accept="image/*" multiple className="hidden" onChange={addFiles} />
          </label>
          <label className="secondary-btn cursor-pointer">
            <Video size={16} /> Додати відео
            <input type="file" accept="video/mp4,video/webm,video/quicktime" multiple className="hidden" onChange={addFiles} />
          </label>
          <button type="button" className={`secondary-btn ${pollEnabled ? 'border-ios-blue/40 bg-ios-blue/10 text-ios-blue' : ''}`} onClick={() => setPollEnabled((value) => !value)} aria-pressed={pollEnabled}>
            <BarChart3 size={16} /> Опитування
          </button>
        </div>
        <p className="mt-2 text-[11px] text-ios-secondary">До {MAX_MEDIA} медіа в одному пості · фото до 25 МБ · відео до 2 ГБ</p>

        {attachments.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {attachments.map((item) => (
              <div key={item.id} className="relative overflow-hidden rounded-2xl border border-ios-separator/15 bg-ios-fill/5">
                {item.type === 'image' ? (
                  <img src={item.preview} alt="Попередній перегляд зображення" className="h-28 w-full object-cover" />
                ) : (
                  <video src={item.preview} preload="metadata" className="h-28 w-full object-cover" aria-label="Попередній перегляд відео" />
                )}
                <button type="button" onClick={() => removeAttachment(item.id)} className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white" aria-label="Прибрати вкладення"><X size={15} /></button>
                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {item.type === 'video'
                    ? item.probing ? 'тривалість…' : item.duration != null ? `${formatDuration(item.duration)}${item.duration > SHORT_VIDEO_MAX_SECONDS ? ' · довге' : ''}` : 'відео'
                    : 'фото'}
                </span>
              </div>
            ))}
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

        {uploadProgress !== null && (
          <div className="mt-3" aria-live="polite">
            <div className="flex justify-between text-[11px] text-ios-secondary">
              <span>Завантажуємо {uploadLabel || 'медіа'}…</span>
              <span>{Math.round(uploadProgress * 100)}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div className="h-full rounded-full bg-ios-blue transition-all" style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
            </div>
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
