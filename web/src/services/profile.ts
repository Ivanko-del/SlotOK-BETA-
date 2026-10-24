import { getDb } from '../lib/db';

export const STATUSES = [
  { value: 'online', label: '🟢 В грі' },
  { value: 'afk', label: '💤 АФК' },
  { value: 'looking', label: '🎯 Шукаю суперника' },
  { value: 'streamer', label: '📺 Стрімлю' },
];

export function setStatus(nick: string, value: string): Promise<void> {
  return getDb().set('users/' + nick + '/status', value);
}

/** «Біо» у профілі — це поле tag (так робить старий updateBio). */
export function setTag(nick: string, text: string): Promise<void> {
  return getDb().set('users/' + nick + '/tag', text.trim().slice(0, 60));
}

export function setAvatar(nick: string, dataUrl: string): Promise<void> {
  return getDb().set('users/' + nick + '/avatar', dataUrl);
}

/** Стискає зображення до max×max JPEG, щоб не роздувати вузол користувача (лише в браузері). */
export function downscaleImage(file: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * k);
      canvas.height = Math.round(img.height * k);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не вдалося прочитати зображення'));
    };
    img.src = url;
  });
}
