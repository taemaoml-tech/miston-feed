import { api } from '../api';
import type { FeedUploadSignature } from '../types/feed';

const CHUNK_SIZE = 8 * 1024 * 1024; // Cloudinary вимагає шматки більші за 5 МБ.
const MAX_ATTEMPTS = 3;

interface CloudinaryResult {
  secure_url?: string;
  error?: { message?: string };
}

function friendlyError(message: string): string {
  if (/file size|too large|maximum|limit/i.test(message)) {
    return 'Сховище не приймає відео такого розміру. Для Cloudinary Free ліміт одного відео — 100 МБ.';
  }
  if (/cors|access-control/i.test(message)) {
    return 'Сховище блокує запит із стрічки. Перевір CORS-правила бакета.';
  }
  return `Не вдалося завантажити відео: ${message}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { window.setTimeout(resolve, ms); });
}

/** Прямий PUT у S3-сумісне сховище (Cloudflare R2 / Backblaze B2). */
function putToS3(url: string, file: File, onProgress?: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new Error(friendlyError(`HTTP ${xhr.status}: ${xhr.responseText.slice(0, 160)}`)));
      }
    };
    xhr.onerror = () => reject(new Error(friendlyError('помилка мережі або CORS')));
    xhr.onabort = () => reject(new Error('Завантаження скасоване'));
    xhr.send(file);
  });
}

/** Chunked-завантаження у Cloudinary, коли S3-сховище не налаштоване. */
async function uploadToCloudinary(
  signed: Extract<FeedUploadSignature, { provider?: 'cloudinary' }>,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const uploadId = globalThis.crypto?.randomUUID?.() ?? `upload-${Date.now()}`;
  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/video/upload`;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  let lastResult: CloudinaryResult | null = null;

  for (let index = 0, start = 0; start < file.size; index += 1) {
    const end = Math.min(start + CHUNK_SIZE, file.size) - 1;
    const headers = {
      'X-Unique-Upload-Id': uploadId,
      'Content-Range': `bytes ${start}-${end}/${file.size}`,
    };
    let chunkResult: CloudinaryResult | null = null;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const form = new FormData();
      form.append('file', file.slice(start, end + 1), file.name);
      form.append('api_key', signed.apiKey);
      form.append('timestamp', String(signed.timestamp));
      form.append('public_id', signed.publicId);
      form.append('folder', signed.folder);
      form.append('signature', signed.signature);

      try {
        const response = await fetch(endpoint, { method: 'POST', body: form, headers });
        const text = await response.text();
        let data: CloudinaryResult = {};
        try { data = text ? JSON.parse(text) as CloudinaryResult : {}; } catch { /* відповідь не JSON */ }
        if (!response.ok) throw new Error(friendlyError(data.error?.message || text.slice(0, 200) || `HTTP ${response.status}`));
        chunkResult = data;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < MAX_ATTEMPTS - 1) await sleep(500 * 2 ** attempt);
      }
    }

    if (!chunkResult) throw lastError ?? new Error('Не вдалося завантажити шматок відео');
    lastResult = chunkResult;
    start = end + 1;
    onProgress?.((index + 1) / totalChunks);
  }

  if (!lastResult?.secure_url) throw new Error('Cloudinary не повернув URL відео');
  return lastResult.secure_url;
}

/**
 * Велике відео йде напряму з браузера у хмарне сховище — API-сервер
 * отримує лише підпис і збережений URL, тому 2 ГБ не проходять через Render.
 */
export async function uploadFeedVideo(file: File, onProgress?: (fraction: number) => void): Promise<string> {
  const signed = await api.feed.signVideoUpload(file.size, file.name);
  if (signed.provider === 's3') {
    await putToS3(signed.uploadUrl, file, onProgress);
    return signed.publicUrl;
  }
  return uploadToCloudinary(signed, file, onProgress);
}
