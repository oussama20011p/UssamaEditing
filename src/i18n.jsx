// UI language: Darija (default), French, English. Strings are looked up by key; missing ones fall back to French.
import React, { createContext, useContext, useEffect, useState } from 'react';

export const LANGS = { dr: 'Darija', fr: 'Français', en: 'English' };
const KEY = 'ussama:lang';

const S = {
  // home
  tagline: { dr: 'Studio · Reels · Captions b Darija · 100% offline', fr: 'Studio · Reels · Sous-titres en darija · 100% hors ligne', en: 'Studio · Reels · Darija captions · 100% offline' },
  newProject: { dr: 'Projet jdid', fr: 'Nouveau projet', en: 'New project' },
  openFile: { dr: '7ell fichier', fr: 'Ouvrir un fichier', en: 'Open a file' },
  recent: { dr: 'Projets li fatou', fr: 'Projets récents', en: 'Recent projects' },
  noProjects: { dr: 'Mazal ma 3ndek ta projet', fr: 'Aucun projet pour l’instant', en: 'No projects yet' },
  noProjectsHint: { dr: 'Khtar format l-fo9 bach tbda l-montage lowel dyalk.', fr: 'Choisis un format ci-dessus pour commencer ton premier montage.', en: 'Pick a format above to start your first edit.' },
  open: { dr: '7ell', fr: 'Ouvrir', en: 'Open' },
  delete: { dr: 'Msa7', fr: 'Supprimer', en: 'Delete' },
  confirmDelete: { dr: 'Msa7 had l-projet? Ghaymchi l la Corbeille.', fr: 'Supprimer ce projet ? Il ira dans la Corbeille.', en: 'Delete this project? It goes to the Trash.' },
  now: { dr: 'Daba', fr: 'À l’instant', en: 'Just now' },
  fmtReel: { dr: 'TikTok · Reels · Shorts', fr: 'TikTok · Reels · Shorts', en: 'TikTok · Reels · Shorts' },
  fmtPost: { dr: 'Feed Instagram', fr: 'Fil Instagram', en: 'Instagram feed' },
  fmtSquare: { dr: 'Feed · Pubs', fr: 'Fil · Pubs', en: 'Feed · Ads' },
  fmtWide: { dr: 'Paysage', fr: 'Paysage', en: 'Landscape' },
  square: { dr: 'Mrabba3', fr: 'Carré', en: 'Square' },
  // top bar
  home: { dr: 'L-accueil · projets', fr: 'Accueil · projets', en: 'Home · projects' },
  save: { dr: 'Sauvi', fr: 'Enregistrer', en: 'Save' },
  export: { dr: 'Exporti', fr: 'Exporter', en: 'Export' },
  language: { dr: 'Lougha', fr: 'Langue', en: 'Language' },
  // rail
  tabMedia: { dr: 'Media', fr: 'Médias', en: 'Media' },
  tabAudio: { dr: 'Audio', fr: 'Audio', en: 'Audio' },
  tabText: { dr: 'Texte', fr: 'Texte', en: 'Text' },
  tabStickers: { dr: 'Stickers', fr: 'Stickers', en: 'Stickers' },
  tabFilters: { dr: 'Filtres', fr: 'Filtres', en: 'Filters' },
  tabTransitions: { dr: 'Transitions', fr: 'Transitions', en: 'Transitions' },
  tabCaptions: { dr: 'Captions', fr: 'Sous-titres', en: 'Captions' },
  tabTemplates: { dr: 'Templates', fr: 'Modèles', en: 'Templates' },
  // library
  videosImages: { dr: 'Vidéos w images', fr: 'Vidéos et images', en: 'Videos & images' },
  music: { dr: 'Musique', fr: 'Musique', en: 'Music' },
  import: { dr: 'Import', fr: 'Importer', en: 'Import' },
  importHint: { dr: 'Clicki hna, wla jerr les fichiers l l-app', fr: 'Clique ici ou glisse tes fichiers dans l’app', en: 'Click here or drop files onto the app' },
  addToTimeline: { dr: 'Zid l-timeline', fr: 'Ajouter à la timeline', en: 'Add to timeline' },
  addAsPip: { dr: 'Zid ka overlay (PiP)', fr: 'Ajouter en incrustation (PiP)', en: 'Add as overlay (PiP)' },
  sfx: { dr: 'Sons (SFX)', fr: 'Effets sonores', en: 'Sound effects' },
  voiceOver: { dr: 'Voix off', fr: 'Voix off', en: 'Voice-over' },
  record: { dr: 'Sajjel b l-micro', fr: 'Enregistrer au micro', en: 'Record with the mic' },
  stop: { dr: 'Wa9ef', fr: 'Arrêter', en: 'Stop' },
  ttsTitle: { dr: 'Texte → voix', fr: 'Texte → voix', en: 'Text → speech' },
  ttsGenerate: { dr: 'Générer la voix', fr: 'Générer la voix', en: 'Generate voice' },
  text: { dr: 'Texte', fr: 'Texte', en: 'Text' },
  stickers: { dr: 'Stickers', fr: 'Stickers', en: 'Stickers' },
  filters: { dr: 'Filtres', fr: 'Filtres', en: 'Filters' },
  transitions: { dr: 'Transitions', fr: 'Transitions', en: 'Transitions' },
  applyAllCuts: { dr: 'Appliqui 3la ga3 les coupures', fr: 'Appliquer à toutes les coupes', en: 'Apply to every cut' },
  captions: { dr: 'Auto-captions', fr: 'Sous-titres auto', en: 'Auto-captions' },
  captionsHint: { dr: 'Kat-transcrire l-klam dyal l-vidéo offline b Whisper, kelma b kelma.', fr: 'Transcrit la voix de la vidéo hors ligne avec Whisper, mot par mot.', en: 'Transcribes the video’s speech offline with Whisper, word by word.' },
  captionsGo: { dr: 'Générer les captions', fr: 'Générer les sous-titres', en: 'Generate captions' },
  look: { dr: 'Look', fr: 'Style', en: 'Look' },
  templates: { dr: 'Templates', fr: 'Modèles', en: 'Templates' },
  // inspector
  project: { dr: 'Projet', fr: 'Projet', en: 'Project' },
  name: { dr: 'Smiya', fr: 'Nom', en: 'Name' },
  pickClip: { dr: 'Khtar clip f l-timeline bach tbeddel l-propriétés dyalo.', fr: 'Sélectionne un clip dans la timeline pour modifier ses propriétés.', en: 'Select a clip on the timeline to edit its properties.' },
  // player / timeline
  player: { dr: 'Lecteur', fr: 'Lecteur', en: 'Player' },
  startEditing: { dr: 'Bda l-montage', fr: 'Commence le montage', en: 'Start editing' },
  importOrDrop: { dr: 'Import vidéo, wla jerrha hna', fr: 'Importe une vidéo ou glisse-la ici', en: 'Import a video or drop it here' },
  dropFiles: { dr: 'Lou7 les fichiers hna', fr: 'Dépose tes fichiers ici', en: 'Drop your files here' },
  laneText: { dr: 'Texte', fr: 'Texte', en: 'Text' },
  laneCaptions: { dr: 'Captions', fr: 'Sous-titres', en: 'Captions' },
  laneOverlay: { dr: 'Overlay', fr: 'Incrust.', en: 'Overlay' },
  laneVideo: { dr: 'Vidéo', fr: 'Vidéo', en: 'Video' },
  laneMusic: { dr: 'Musique', fr: 'Musique', en: 'Music' },
  dropVideoHere: { dr: 'Jerr vidéo hna', fr: 'Glisse une vidéo ici', en: 'Drop a video here' },
  dropPipHere: { dr: 'Jerr vidéo / image hna (PiP)', fr: 'Glisse une vidéo / image ici (PiP)', en: 'Drop a video / image here (PiP)' },
  undo: { dr: 'Rja3 (⌘Z)', fr: 'Annuler (⌘Z)', en: 'Undo (⌘Z)' },
  redo: { dr: '3awed (⌘⇧Z)', fr: 'Rétablir (⌘⇧Z)', en: 'Redo (⌘⇧Z)' },
  split: { dr: '9ss (S)', fr: 'Diviser (S)', en: 'Split (S)' },
  trimLeft: { dr: 'Msa7 3la lissar (Q)', fr: 'Supprimer à gauche (Q)', en: 'Delete left (Q)' },
  trimRight: { dr: 'Msa7 3la limen (W)', fr: 'Supprimer à droite (W)', en: 'Delete right (W)' },
  deleteClip: { dr: 'Msa7 (Delete)', fr: 'Supprimer (Suppr)', en: 'Delete (Del)' },
  duplicate: { dr: 'Dupliqui (⌘D)', fr: 'Dupliquer (⌘D)', en: 'Duplicate (⌘D)' },
  freeze: { dr: 'Freeze frame', fr: 'Figer l’image', en: 'Freeze frame' },
  reverse: { dr: 'M9loub (reverse)', fr: 'Inverser', en: 'Reverse' },
  addText: { dr: 'Zid texte', fr: 'Ajouter du texte', en: 'Add text' },
  snapping: { dr: 'Magnétisme', fr: 'Magnétisme', en: 'Snapping' },
  fit: { dr: 'Kolchi', fr: 'Ajuster', en: 'Fit' },
  // export
  exportTitle: { dr: 'Export MP4', fr: 'Exporter en MP4', en: 'Export MP4' },
  duration: { dr: 'Modda', fr: 'Durée', en: 'Duration' },
  format: { dr: 'Format', fr: 'Format', en: 'Format' },
  cancel: { dr: 'Annuli', fr: 'Annuler', en: 'Cancel' },
  exportDone: { dr: 'Export sala ✅', fr: 'Export terminé ✅', en: 'Export done ✅' },
  showInFolder: { dr: 'Wrri f dossier', fr: 'Afficher dans le dossier', en: 'Show in folder' },
  exportFailed: { dr: 'Export fchel', fr: 'L’export a échoué', en: 'Export failed' },
  close: { dr: 'Sedd', fr: 'Fermer', en: 'Close' },
  qualityHigh: { dr: 'Mzyana (TikTok / Reels)', fr: 'Haute (TikTok / Reels)', en: 'High (TikTok / Reels)' },
  qualityMedium: { dr: 'Wasta', fr: 'Moyenne', en: 'Medium' },
  qualitySmall: { dr: 'Fichier sghir', fr: 'Petit fichier', en: 'Small file' },
  yes: { dr: 'Ah ✅', fr: 'Oui ✅', en: 'Yes ✅' },
  no: { dr: 'La', fr: 'Non', en: 'No' },
};

const LangCtx = createContext({ lang: 'dr', setLang: () => {} });

function initialLang() {
  try {
    const v = localStorage.getItem(KEY);
    return LANGS[v] ? v : 'dr';
  } catch {
    return 'dr';
  }
}

export function LangProvider({ children }) {
  const [lang, setLang] = useState(initialLang);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      // Not persisted; the choice still applies for this session.
    }
    document.documentElement.lang = lang === 'dr' ? 'ar-MA' : lang;
  }, [lang]);
  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}

export function useLang() {
  return useContext(LangCtx);
}

export function useT() {
  const { lang } = useContext(LangCtx);
  return (key) => S[key]?.[lang] ?? S[key]?.fr ?? key;
}

export function LangSwitch({ compact }) {
  const { lang, setLang } = useLang();
  return (
    <div className={`lang-switch ${compact ? 'compact' : ''}`} role="group" aria-label="Language">
      {Object.entries(LANGS).map(([k, v]) => (
        <button key={k} className={lang === k ? 'on' : ''} onClick={() => setLang(k)} title={v}>{k === 'dr' ? 'DR' : k.toUpperCase()}</button>
      ))}
    </div>
  );
}
