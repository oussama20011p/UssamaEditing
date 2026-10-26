// Project templates: they add styled text and pick a format / caption look, keeping the user's media.
import { newTextClip } from './store.js';

const text = (id, start, duration, preset, patch) => ({ ...newTextClip(id, start, preset), duration, ...patch });

export const TEMPLATES = [
  {
    id: 'hook', emoji: '🎯', label: 'Reel · Hook + Captions', desc: 'Hook f boîte l-fo9, captions bold, CTA f l-akhir',
    format: '9:16', captions: { preset: 'bold', y: 0.7 },
    texts: (d, uid) => [
      text(uid(), 0, Math.min(3, d), 'hook', { text: 'Hook dyalk hna 👇', y: 0.18 }),
      text(uid(), Math.max(0, d - 2.5), 2.5, 'title', { text: 'Follow ✅', y: 0.5, size: 110, anim: 'pop' }),
    ],
  },
  {
    id: 'podcast', emoji: '🎙', label: 'Podcast clip', desc: 'Titre fixe l-fo9, captions f boîte',
    format: '9:16', captions: { preset: 'box', y: 0.74 },
    texts: (d, uid) => [text(uid(), 0, Math.max(1, d), 'hook', { text: 'Smiya dyal l-podcast', y: 0.1, size: 64, anim: 'fade' })],
  },
  {
    id: 'product', emoji: '🛍', label: 'Pub produit', desc: 'Hook, taman w CTA "Commandi daba"',
    format: '9:16', captions: { preset: 'word', y: 0.62 },
    texts: (d, uid) => [
      text(uid(), 0, Math.min(3, d), 'hook', { text: 'Had l-produit ghaybeddel lik…', y: 0.16, size: 72 }),
      text(uid(), Math.max(0, d * 0.55), Math.min(3, d * 0.3), 'title', { text: '💰 [PRIX] DH', y: 0.82, size: 100, color: '#e9b949', anim: 'pop' }),
      text(uid(), Math.max(0, d - 3), 3, 'hook', { text: 'Commandi daba 👆', y: 0.82, bg: '#ff4d6d', color: '#ffffff', anim: 'pop' }),
    ],
  },
  {
    id: 'tuto', emoji: '📚', label: 'Tutorial · étapes', desc: 'Titre + 3 étapes numérotées',
    format: '9:16', captions: { preset: 'clean', y: 0.78 },
    texts: (d, uid) => [
      text(uid(), 0, Math.min(2.5, d), 'title', { text: 'Kifach…?', y: 0.2, size: 110 }),
      ...[1, 2, 3].map((n) => text(uid(), (d * n) / 4, Math.max(1, d / 4), 'hook', { text: `Étape ${n}`, y: 0.12, size: 60, anim: 'slide' })),
    ],
  },
  {
    id: 'youtube', emoji: '▶️', label: 'YouTube 16:9', desc: 'Format paysage, titre f l-bidaya',
    format: '16:9', captions: { preset: 'clean', y: 0.86 },
    texts: (d, uid) => [text(uid(), 0, Math.min(3, d), 'title', { text: 'Titre dyal l-vidéo', y: 0.5, size: 90, anim: 'fade' })],
  },
];
