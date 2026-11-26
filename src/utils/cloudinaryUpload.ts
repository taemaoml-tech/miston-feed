import { api } from '../api';

const CHUNK_SIZE = 8 * 1024 * 1024; // Cloudinary вимагає шматки більші за 5 МБ.
const MAX_ATTEMPTS = 3;

interface CloudinaryResult {
  secure_url?: string;
  done?: boolean;
  error?: { message?: string };
}

function friendlyError(message: string): string {
  if (/file size|too large|maximum|limit/i.test(message)) {
    return 'Хмарне сховище не приймає відео такого розміру. Для файлів понад 100 МБ потрібен платний тариф Cloudinary.';
  }
  return `Не вдалося завантажити відео: ${message}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { window.setTimeout(resolve, ms); });
}

/**
 * Велике відео йде напряму з браузера в Cloudinary шматками — API-сервер
 * отримує лише підпис і збережений URL, тому 2 ГБ не проходять через Render.
 */
export async function uploadFeedVideo(file: File, onProgress?: (fraction: number) => void): Promise<string> {
  const signed = await api.feed.signVideoUpload(file.size);
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
