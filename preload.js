// Puente seguro: el renderer solo puede llamar a canales de esta lista.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const INVOKE = ['sys:info', 'cfg:get', 'cfg:set', 'app:elevate', 'prog:list', 'prog:openLocation', 'prog:openKey', 'prog:google', 'prog:web', 'prog:modify', 'prog:exportList', 'export:save',
  'uninst:prepare', 'uninst:start', 'uninst:wait', 'uninst:skip', 'scan:run', 'scan:delReg', 'scan:delFiles', 'quick:confirm', 'quick:end',
  'file:open', 'file:parent', 'file:props', 'dlg:pick', 'start:list', 'start:run', 'start:kill', 'start:add', 'start:remove', 'start:toggle',
  'junk:scan', 'junk:clean', 'brow:scan', 'brow:clean', 'off:scan', 'off:clean', 'win:scan', 'win:clean', 'shred:run', 'evid:drives', 'evid:start', 'evid:cancel',
  'bk:list', 'bk:restore', 'bk:delete', 'bk:deleteAll', 'bk:open', 'bk:create', 'wt:list', 'wt:run',
  'hunter:open', 'hunter:resolve', 'hunter:procs', 'hunter:kill', 'hunter:folder', 'hunter:unstart', 'hunter:uninstall'];
const ON = ['menu', 'cli', 'toast', 'open-wizard', 'shred:progreso', 'evid:progreso'];

contextBridge.exposeInMainWorld('barredor', {
  invoke: (ch, ...args) => (INVOKE.includes(ch) ? ipcRenderer.invoke(ch, ...args) : Promise.reject(new Error('Canal no permitido: ' + ch))),
  on: (ch, cb) => { if (ON.includes(ch)) ipcRenderer.on(ch, (_e, d) => cb(d)); },
  rutaDe: (file) => webUtils.getPathForFile(file)
});
