'use strict';
const $ = id => document.getElementById(id);
const TOGGLES = ['startWithWindows', 'askWhereToSave', 'notify'];

function paint(st) {
  const s = st.settings;
  $('version').textContent = 'v' + st.version;
  const hk = $('hotkey');
  if (!hk.options.length) {
    for (const h of st.hotkeys) hk.add(new Option(h.label, h.id));
  }
  hk.value = s.hotkey;
  $('hkLabel').textContent = (st.hotkeys.find(h => h.id === s.hotkey) || {}).label || s.hotkey;
  $('hkError').classList.toggle('hidden', st.hotkeyOk);
  $('psTip').classList.toggle('hidden', s.hotkey !== 'PrintScreen');
  for (const k of TOGGLES) $(k).checked = !!s[k];
  // Rodando pelo "npm start" o Windows abriria o Electron puro, então a opção só vale no app instalado.
  $('startWithWindows').disabled = !st.packaged;
  $('startNote').textContent = st.packaged
    ? 'Fica pronto na bandeja assim que o PC liga.'
    : 'Disponível no app instalado.';
  $('saveDir').textContent = s.saveDir;
}

api.getState().then(paint);
api.onState(paint);

$('btnCapture').onclick = () => api.capture();
$('hotkey').onchange = e => api.setSettings({ hotkey: e.target.value }).then(paint);
for (const k of TOGGLES) $(k).onchange = e => api.setSettings({ [k]: e.target.checked }).then(paint);
$('btnChoose').onclick = () => api.chooseFolder().then(paint);
$('btnOpen').onclick = () => api.openFolder();
$('btnKeyboard').onclick = () => api.openKeyboardSettings();
