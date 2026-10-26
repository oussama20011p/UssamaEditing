// Bridge between the UI and the main process: window.api.<name>(...) calls the matching channel.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
const subscribe = (channel) => (fn) => {
  const listener = (_event, value) => fn(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.off(channel, listener);
};

const CALLS = {
  importMedia: 'media:import',
  saveSticker: 'sticker:save',
  listSfx: 'sfx:list',
  saveVoice: 'voice:save',
  micAccess: 'mic:access',
  ttsVoices: 'tts:voices',
  makeTts: 'tts:make',
  freezeFrame: 'clip:freeze',
  reverseClip: 'clip:reverse',
  listProjects: 'projects:list',
  loadProject: 'projects:load',
  storeProject: 'projects:save',
  deleteProject: 'projects:delete',
  saveProject: 'project:save',
  openProject: 'project:open',
  exportVideo: 'export:start',
  cancelExport: 'export:cancel',
  showInFolder: 'shell:show',
  captionsStatus: 'captions:status',
  generateCaptions: 'captions:generate',
  cancelCaptions: 'captions:cancel',
  removeBackground: 'cutout:start',
  cancelCutout: 'cutout:cancel',
};
const EVENTS = { onExportProgress: 'export:progress', onCaptionsProgress: 'captions:progress', onCutoutProgress: 'cutout:progress' };

const api = { platform: process.platform };
for (const [name, channel] of Object.entries(CALLS)) api[name] = call(channel);
for (const [name, channel] of Object.entries(EVENTS)) api[name] = subscribe(channel);
// Dropped files: the renderer only has File objects; their paths come from webUtils.
api.importFiles = (files) => ipcRenderer.invoke('media:importPaths', Array.from(files, (f) => webUtils.getPathForFile(f)));

contextBridge.exposeInMainWorld('api', api);
