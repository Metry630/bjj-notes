// Strava screenshots, shrunk on the phone before upload. A long edge of 1600 px keeps every number
// readable for the coach (and is about what Claude's vision uses anyway), and makes a phone
// screenshot ~200 KB of JPEG instead of a 2-3 MB PNG. Uploaded as base64 slices like recordings.
import { slices } from './recorder.js';

export const MAX_EDGE = 1600;
export const MAX_IMAGES = 6;

export function fitWithin(w, h, max = MAX_EDGE) {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

// File -> something drawable. createImageBitmap where the phone has it, else an <img> from a data:
// URL (the page's CSP allows data: images, not blob:).
async function decode(file) {
  if (globalThis.createImageBitmap) {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through: some formats only decode through <img>
    }
  }
  const url = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

// -> { dataUrl, b64, mime, w, h }, a JPEG at most MAX_EDGE on its long side.
export async function shrink(file, { max = MAX_EDGE, quality = 0.8 } = {}) {
  const src = await decode(file);
  const { w, h } = fitWithin(src.width || src.naturalWidth, src.height || src.naturalHeight, max);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // a transparent PNG would turn black as JPEG
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  src.close?.();
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { dataUrl, b64: dataUrl.split(',')[1] || '', mime: 'image/jpeg', w, h };
}

// App · Images rows for screenshot `part` (1..6) of coach message `coachId`, 10 per request.
export function imageBatches(coachId, part, b64, mime = 'image/jpeg', perBatch = 10) {
  const parts = slices(b64);
  const rows = parts.map((data, i) => ({ id: `${coachId}.${part}-${i + 1}`, coach_id: coachId, part, seq: i + 1, total: parts.length, mime, data }));
  const out = [];
  for (let i = 0; i < rows.length; i += perBatch) out.push(rows.slice(i, i + perBatch));
  return out;
}
