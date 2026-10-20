// StylleScreen HD: fica na bandeja do Windows, captura a tela por atalho, deixa anotar e copia/salva o resultado.
const {
  app, BrowserWindow, Tray, Menu, globalShortcut, desktopCapturer, screen, ipcMain,
  clipboard, nativeImage, dialog, shell, Notification,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const APP_NAME = 'StylleScreen HD';
const ICON = path.join(__dirname, 'assets', 'icon.png');
const HOTKEYS = [
  { id: 'CommandOrControl+Alt+S', label: 'Ctrl + Alt + S' },
  { id: 'PrintScreen', label: 'Print Screen' },
  { id: 'CommandOrControl+Shift+X', label: 'Ctrl + Shift + X' },
  { id: 'CommandOrControl+Alt+A', label: 'Ctrl + Alt + A' },
  { id: 'Alt+Shift+S', label: 'Alt + Shift + S' },
];

app.setAppUserModelId('com.stylle.screenhd');
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showHome());
}

let settings, settingsFile;
let tray = null, home = null, quitting = false, hotkeyOk = false;
let overlays = [], capturing = false, homeWasVisible = false;

// ---------- configurações ----------
function defaults() {
  return {
    settingsVersion: 2,
    hotkey: 'CommandOrControl+Alt+S',
    startWithWindows: true,
    saveDir: path.join(app.getPath('pictures'), APP_NAME),
    askWhereToSave: true,
    notify: true,
    tool: 'rect',
    color: '#ff3b5c',
    size: 4,
  };
}

function loadSettings() {
  settingsFile = path.join(app.getPath('userData'), 'settings.json');
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch {}
  // Versão 1 usava Print Screen como padrão; quem já tinha instalado passa para Ctrl+Alt+S.
  if (saved.hotkey && !saved.settingsVersion) { delete saved.hotkey; saved.settingsVersion = 2; }
  settings = { ...defaults(), ...saved };
}

function saveSettings() {
  try { fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2)); } catch (e) { console.error('settings', e); }
}

function applyHotkey() {
  globalShortcut.unregisterAll();
  try { hotkeyOk = globalShortcut.register(settings.hotkey, startCapture); } catch { hotkeyOk = false; }
}

function applyStartup() {
  // Em desenvolvimento registraria o electron.exe; só vale no app instalado.
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: !!settings.startWithWindows, path: process.execPath, args: ['--hidden'] });
}

function state() {
  return { settings, hotkeyOk, hotkeys: HOTKEYS, version: app.getVersion(), packaged: app.isPackaged };
}

function pushState() {
  if (home && !home.isDestroyed()) home.webContents.send('home:state', state());
  buildTrayMenu();
}

// ---------- janela principal ----------
function showHome() {
  if (home && !home.isDestroyed()) {
    if (home.isMinimized()) home.restore();
    home.show(); home.focus();
    return;
  }
  // Tamanho fixo: não maximiza nem redimensiona. Em telas baixas, a altura se ajusta e o conteúdo rola.
  const workH = screen.getPrimaryDisplay().workAreaSize.height;
  home = new BrowserWindow({
    width: 560, height: Math.min(760, workH - 40), show: false,
    resizable: false, maximizable: false, fullscreenable: false,
    title: APP_NAME, icon: ICON, backgroundColor: '#120809', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  home.loadFile(path.join(__dirname, 'renderer', 'home.html'));
  home.once('ready-to-show', () => home.show());
  // O duplo clique na barra de título também tenta maximizar; desfaz na hora.
  home.on('maximize', () => home.unmaximize());
  // Fechar só esconde: o app continua na bandeja esperando o atalho.
  home.on('close', e => { if (!quitting) { e.preventDefault(); home.hide(); } });
}

// ---------- bandeja ----------
function buildTrayMenu() {
  if (!tray) return;
  const label = (HOTKEYS.find(h => h.id === settings.hotkey) || {}).label || settings.hotkey;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Capturar agora    (${label})`, click: () => startCapture() },
    { type: 'separator' },
    { label: `Abrir o ${APP_NAME}`, click: showHome },
    { label: 'Abrir a pasta das capturas', click: openSaveDir },
    { label: 'Iniciar com o Windows', type: 'checkbox', checked: !!settings.startWithWindows, enabled: app.isPackaged,
      click: item => { settings.startWithWindows = item.checked; saveSettings(); applyStartup(); pushState(); } },
    { type: 'separator' },
    { label: 'Sair', click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 32, height: 32 }));
  tray.setToolTip(`${APP_NAME} - clique para capturar`);
  tray.on('click', () => startCapture());
  buildTrayMenu();
}

function openSaveDir() {
  fs.mkdirSync(settings.saveDir, { recursive: true });
  shell.openPath(settings.saveDir);
}

// ---------- captura ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));

// O desktopCapturer do Electron leva ~2 s por captura no Windows. Um PowerShell que fica aberto
// com o System.Drawing carregado fotografa os monitores em ~100 ms; o Electron fica como plano B.
let grabber = null, grabberReady = false, grabWaiter = null;

function startGrabber() {
  if (process.platform !== 'win32') return;
  const script = fs.readFileSync(path.join(__dirname, 'assets', 'grab.ps1'), 'utf8');
  const dir = path.join(app.getPath('temp'), 'StylleScreenHD');
  grabber = spawn('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { windowsHide: true, env: { ...process.env, STYLLE_CAPDIR: dir } });
  let buf = '';
  grabber.stdout.on('data', chunk => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line === 'READY') grabberReady = true;
      else if (line && grabWaiter) { const w = grabWaiter; grabWaiter = null; w(line); }
    }
  });
  grabber.stderr.on('data', d => console.error('[grab]', d.toString()));
  grabber.on('exit', () => {
    grabber = null; grabberReady = false;
    if (grabWaiter) { const w = grabWaiter; grabWaiter = null; w(null); }
  });
}

function grabNative() {
  if (!grabber || !grabberReady || grabWaiter) return Promise.resolve(null);
  return new Promise(resolve => {
    const timer = setTimeout(() => { grabWaiter = null; resolve(null); }, 5000);
    grabWaiter = line => {
      clearTimeout(timer);
      try {
        const r = JSON.parse(line);
        resolve(r.ok ? r.shots : null);
      } catch { resolve(null); }
    };
    grabber.stdin.write('grab\n');
  });
}

// Devolve, para cada monitor, a foto da tela em resolução real.
async function grabScreens(displays) {
  const shots = await grabNative();
  if (shots && shots.length) {
    const out = [];
    for (const d of displays) {
      const r = screen.dipToScreenRect(null, d.bounds);
      const shot = shots.find(s => Math.abs(s.x - r.x) <= 2 && Math.abs(s.y - r.y) <= 2) || (displays.length === 1 ? shots[0] : null);
      if (shot) out.push({ display: d, data: fs.readFileSync(shot.file), mime: 'image/bmp' });
    }
    if (out.length === displays.length) return out;
  }
  const maxW = Math.max(...displays.map(d => Math.round(d.size.width * d.scaleFactor)));
  const maxH = Math.max(...displays.map(d => Math.round(d.size.height * d.scaleFactor)));
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: maxW, height: maxH } });
  const out = [];
  for (const d of displays) {
    const src = sources.find(s => String(s.display_id) === String(d.id)) || (displays.length === 1 ? sources[0] : null);
    if (src && !src.thumbnail.isEmpty()) out.push({ display: d, data: src.thumbnail.toPNG(), mime: 'image/png' });
  }
  return out;
}

async function startCapture() {
  if (capturing) return;
  capturing = true;
  homeWasVisible = !!(home && !home.isDestroyed() && home.isVisible() && !home.isMinimized());
  try {
    // Esconde a janela do app para ela não sair na foto.
    if (homeWasVisible) { home.hide(); await sleep(200); }
    const displays = screen.getAllDisplays();
    const active = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    for (const shot of await grabScreens(displays)) {
      createOverlay(shot.display, shot.data, shot.mime, shot.display.id === active.id);
    }
    if (!overlays.length) throw new Error('Nenhuma tela capturada.');
  } catch (e) {
    console.error('capture', e);
    closeOverlays();
    notify('Não foi possível capturar a tela', String(e.message || e));
  }
}

function createOverlay(display, image, mime, focus) {
  const b = display.bounds;
  const win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height, show: false, frame: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true,
    hasShadow: false, enableLargerThanScreen: true, backgroundColor: '#000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setBounds(b);
  win.focusOnShow = focus;
  win.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('overlay:init', { image, mime, tool: settings.tool, color: settings.color, size: settings.size });
  });
  win.on('closed', () => {
    overlays = overlays.filter(w => w !== win);
    if (!overlays.length) capturing = false;
  });
  overlays.push(win);
}

function closeOverlays() {
  for (const w of overlays.slice()) if (!w.isDestroyed()) w.destroy();
  overlays = [];
  capturing = false;
  if (homeWasVisible && home && !home.isDestroyed()) home.show();
  homeWasVisible = false;
}

ipcMain.on('overlay:ready', e => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  win.show();
  win.setBounds(win.getBounds());
  if (win.focusOnShow) { win.focus(); win.webContents.focus(); }
});

ipcMain.on('overlay:cancel', () => closeOverlays());

ipcMain.handle('overlay:done', async (_e, { action, png, prefs }) => {
  if (prefs) { Object.assign(settings, pick(prefs, ['tool', 'color', 'size'])); saveSettings(); }
  const buf = Buffer.from(png);
  const image = nativeImage.createFromBuffer(buf);
  closeOverlays();
  clipboard.writeImage(image);
  if (action === 'save') await saveImage(buf, image);
  else notify('Copiado!', 'Cole com Ctrl+V onde quiser.');
});

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function saveImage(buf, image) {
  try { fs.mkdirSync(settings.saveDir, { recursive: true }); } catch {}
  let file = path.join(settings.saveDir, `StylleScreen_${stamp()}.png`);
  if (settings.askWhereToSave) {
    const r = await dialog.showSaveDialog({
      title: 'Salvar captura', defaultPath: file,
      filters: [{ name: 'Imagem PNG', extensions: ['png'] }, { name: 'Imagem JPG', extensions: ['jpg', 'jpeg'] }],
    });
    if (r.canceled || !r.filePath) return notify('Copiado!', 'O arquivo não foi salvo, mas a imagem está copiada.');
    file = r.filePath;
  }
  try {
    fs.writeFileSync(file, /\.jpe?g$/i.test(file) ? image.toJPEG(92) : buf);
    notify('Salvo e copiado!', path.basename(file) + ' · clique para abrir a pasta', () => shell.showItemInFolder(file));
  } catch (e) {
    dialog.showErrorBox('Não foi possível salvar', `${file}\n\n${e.message}`);
  }
}

function notify(title, body, onClick) {
  if (!settings.notify || !Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: nativeImage.createFromPath(ICON), silent: true });
  if (onClick) n.on('click', onClick);
  n.show();
}

// ---------- janela principal: IPC ----------
ipcMain.handle('home:get', () => state());

ipcMain.handle('home:set', (_e, patch) => {
  const allowed = pick(patch || {}, ['hotkey', 'startWithWindows', 'askWhereToSave', 'notify']);
  if (allowed.hotkey && !HOTKEYS.some(h => h.id === allowed.hotkey)) delete allowed.hotkey;
  Object.assign(settings, allowed);
  saveSettings();
  if ('hotkey' in allowed) applyHotkey();
  if ('startWithWindows' in allowed) applyStartup();
  pushState();
  return state();
});

ipcMain.on('home:capture', () => startCapture());
ipcMain.on('home:openFolder', openSaveDir);
ipcMain.on('home:openKeyboardSettings', () => shell.openExternal('ms-settings:easeofaccess-keyboard'));

ipcMain.handle('home:chooseFolder', async () => {
  const r = await dialog.showOpenDialog(home, { title: 'Pasta das capturas', defaultPath: settings.saveDir, properties: ['openDirectory', 'createDirectory'] });
  if (!r.canceled && r.filePaths[0]) { settings.saveDir = r.filePaths[0]; saveSettings(); pushState(); }
  return state();
});

// ---------- ciclo de vida ----------
app.whenReady().then(() => {
  loadSettings();
  startGrabber();
  createTray();
  applyHotkey();
  applyStartup();
  // Ao ligar o PC o app abre escondido na bandeja; aberto pelo atalho, mostra a janela.
  if (!process.argv.includes('--hidden')) showHome();
});

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (grabber) grabber.kill();
});
// Sem janelas abertas o app continua rodando na bandeja.
app.on('window-all-closed', () => {});
