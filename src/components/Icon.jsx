import React from 'react';
import logoUrl from '../../assets/logo.svg';

export const Logo = ({ size = 28, className = '' }) => <img src={logoUrl} width={size} height={size} className={`logo-img ${className}`} alt="UssamaEditing" draggable={false} />;

// Minimal stroke icon set (24x24, 2px stroke), drawn for this app.
const P = {
  media: 'M4 5h16v14H4z M4 9h16 M8 5v4 M16 5v4 M10 12.5l4 2.5-4 2.5z',
  audio: 'M9 18V6l11-2v12 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  text: 'M5 6V4h14v2 M12 4v16 M9 20h6',
  filter: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 3v18 M12 7h6.5 M12 12h9 M12 17h6.5',
  transition: 'M4 6h7v12H4z M13 6h7v12h-7z M9 12h6 M13 10l2 2-2 2',
  captions: 'M3 5h18v12H8l-5 4z M7 10h4 M13 10h4 M7 13h7',
  effects: 'M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3z M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z',
  split: 'M6 4v16 M18 4v16 M6 12h12 M9 9l3 3-3 3',
  scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M20 4L8.1 15.9 M14.5 14.5L20 20 M8.1 8.1L12 12',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
  undo: 'M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7z M13 4h4v16h-4z',
  plus: 'M12 5v14 M5 12h14',
  export: 'M12 15V3 M7 8l5-5 5 5 M4 15v5h16v-5',
  maximize: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  magnet: 'M6 4v8a6 6 0 0 0 12 0V4 M6 4h4v8a2 2 0 0 0 4 0V4h4 M6 8h4 M14 8h4',
  copy: 'M8 8h12v12H8z M16 8V4H4v12h4',
  zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4 M11 8v6 M8 11h6',
  zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4 M8 11h6',
  mirror: 'M12 3v18 M8 7L3 12l5 5z M16 7l5 5-5 5z',
  folder: 'M3 6h6l2 2h10v11H3z',
  save: 'M5 3h12l3 3v15H4V3z M8 3v5h8V3 M8 21v-7h8v7',
  trimLeft: 'M10 4v16 M14 8l-4 4 4 4 M20 6v12',
  trimRight: 'M14 4v16 M10 8l4 4-4 4 M4 6v12',
  prev: 'M18 5L9 12l9 7z M6 5v14',
  next: 'M6 5l9 7-9 7z M18 5v14',
  sparkles: 'M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3z',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 16v4h16v-4',
  volume: 'M4 9h4l5-4v14l-5-4H4z M16 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9h4l5-4v14l-5-4H4z M17 9l4 6 M21 9l-4 6',
  check: 'M5 12l5 5 9-10',
  file: 'M6 3h8l4 4v14H6z M14 3v4h4',
  home: 'M3 11l9-7 9 7 M5 10v10h5v-6h4v6h5V10',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  sticker: 'M12 3a9 9 0 1 0 9 9h-6a3 3 0 0 1-3-3z M15 3.5A9 9 0 0 1 20.5 9H15z M9 14.5c.8.9 1.8 1.4 3 1.4 M9 10h.01 M14 10h.01',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5 11a7 7 0 0 0 14 0 M12 18v3',
  diamond: 'M12 4l8 8-8 8-8-8z',
  freeze: 'M12 2v20 M4 6l16 12 M20 6L4 18',
  reverse: 'M3 12a9 9 0 1 0 3-6.7 M3 4v5h5',
  wand: 'M4 20L16 8 M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1z M18 12l.7 1.3L20 14l-1.3.7L18 16l-.7-1.3L16 14l1.3-.7z',
  template: 'M4 4h16v6H4z M4 14h7v6H4z M15 14h5v6h-5z',
};

export default function Icon({ name, size = 18, className = '', title }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <path d={P[name] || ''} />
    </svg>
  );
}
