// Debloat de Windows: apps preinstaladas (Appx) y características opcionales. Las reglas de seguridad viven aquí y en main.js; el renderer no decide.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const U = require('./util');

// ---------- Apps preinstaladas ----------
// Protección: nunca se listan ni se pueden quitar (el nombre se compara sin distinguir mayúsculas).
const PROTEGIDAS = [
  /^Microsoft\.(WindowsStore|StorePurchaseApp|Services\.Store)/i, /ShellExperienceHost|StartMenuExperienceHost/i, /^Microsoft\.Windows\.Search/i, /SecHealthUI/i,
  /ImmersiveControlPanel/i, /^Microsoft\.Windows\.Client\.(CBS|Core)/i, /^Microsoft\.AAD\.BrokerPlugin/i, /^Microsoft\.AccountsControl/i, /^Microsoft\.CredDialogHost/i,
  /^Microsoft\.LockApp/i, /WebView2|Win32WebViewHost|^Microsoft\.MicrosoftEdge|^Microsoft\.Edge/i, /^Microsoft\.VCLibs/i, /^Microsoft\.NET\.Native/i, /^Microsoft\.UI\.Xaml/i,
  /^Microsoft\.WindowsAppRuntime/i, /^Microsoft\.(DesktopAppInstaller|Winget)/i, /LanguageExperiencePack/i, /(HEVC|VP9|AV1|MPEG2|HEIF|Webp|Raw)(Video|Image)Extension|WebMediaExtensions/i,
  /^MicrosoftWindows\./i, /^Windows\./i, /^Microsoft\.Windows\./i, /^NcsiUwpApp$|^Microsoft\.(Win32WebViewHost|BioEnrollment|ECApp|AsyncTextService|CloudExperienceHost)/i
];
// Muy usadas: se muestran con aviso, no se bloquean (tienen prioridad sobre la lista de protección).
const AVISO = [
  [/^Microsoft\.WindowsCalculator$/i, 'Calculadora', 'Calculadora: la usa mucha gente. Se puede reinstalar desde la Tienda.'],
  [/^Microsoft\.Windows\.Photos$/i, 'Fotos', 'Fotos es el visor de imágenes por defecto. Si la quitas, abre las imágenes con otro programa.'],
  [/^Microsoft\.WindowsTerminal$/i, 'Terminal de Windows', 'Terminal de Windows es la consola moderna. Quítala solo si no la usas.']
];
// Relleno que se suele quitar: [patrón del nombre interno, nombre en español]. Todo lo que casa aquí se marca "Recomendado quitar".
const RELLENO = [
  [/^Microsoft\.XboxGamingOverlay/i, 'Xbox Game Bar'], [/^Microsoft\.(XboxApp|GamingApp)$/i, 'Xbox'], [/^Microsoft\.Xbox/i, 'Xbox (componente)'],
  [/^Microsoft\.MicrosoftSolitaireCollection/i, 'Solitario (Microsoft Solitaire Collection)'], [/^Clipchamp\.Clipchamp/i, 'Clipchamp'],
  [/^Microsoft\.BingNews/i, 'Noticias'], [/^Microsoft\.BingWeather/i, 'Tiempo'], [/^Microsoft\.Bing/i, 'Bing (componente)'],
  [/^Microsoft\.SkypeApp/i, 'Skype'], [/^MicrosoftTeams$/i, 'Microsoft Teams (personal)'], [/^Microsoft\.MixedReality\.Portal/i, 'Portal de realidad mixta'],
  [/^Microsoft\.Microsoft3DViewer/i, 'Visor 3D'], [/^Microsoft\.MSPaint$/i, 'Paint 3D'], [/^Microsoft\.Print3D/i, 'Print 3D'], [/^Microsoft\.WindowsFeedbackHub/i, 'Centro de opiniones'],
  [/^Microsoft\.GetHelp/i, 'Obtener ayuda'], [/^Microsoft\.Getstarted/i, 'Consejos'], [/^Microsoft\.WindowsMaps/i, 'Mapas'],
  [/^microsoft\.windowscommunicationsapps/i, 'Correo y Calendario'], [/^Microsoft\.People$/i, 'Gente'], [/^Microsoft\.YourPhone/i, 'Su Teléfono / Phone Link'],
  [/^Microsoft\.549981C3F5F10/i, 'Cortana'], [/^Microsoft\.Todos/i, 'Microsoft To Do'], [/^Microsoft\.MicrosoftOfficeHub/i, 'Office (acceso directo a Microsoft 365)'],
  [/^Microsoft\.PowerAutomateDesktop/i, 'Power Automate'], [/^Microsoft\.ZuneVideo/i, 'Películas y TV'], [/^Microsoft\.ZuneMusic/i, 'Groove Música / Reproductor multimedia'],
  [/^Microsoft\.(Office\.Sway|OneConnect|Wallet|Messaging|Whiteboard)/i, 'Aplicación de relleno de Microsoft'],
  [/^(king\.com|Disney|SpotifyAB|Facebook|Instagram|TikTok|AmazonVideo|Duolingo|Netflix|Twitter|LinkedIn)/i, 'App promocional preinstalada']
];
// Opcionales: con nombre bonito pero sin recomendación.
const OPCIONAL = [[/^Microsoft\.MicrosoftStickyNotes/i, 'Notas rápidas (opcional)'], [/^Microsoft\.WindowsAlarms/i, 'Alarmas y reloj'], [/^Microsoft\.WindowsCamera/i, 'Cámara'], [/^Microsoft\.WindowsSoundRecorder/i, 'Grabadora de voz']];

// Devuelve el motivo por el que un paquete NO se puede listar ni quitar, o '' si se permite. p: { Name, IsFramework, NonRemovable, Sig }
function appBloqueada(p) {
  if (!p || typeof p.Name !== 'string' || !p.Name) return 'Paquete no válido';
  if (p.IsFramework) return 'Es un componente (framework)';
  if (p.NonRemovable) return 'Windows no permite quitarlo';
  if (/^system$/i.test(String(p.Sig || ''))) return 'Es parte del sistema';
  if (AVISO.some(([re]) => re.test(p.Name))) return '';
  if (PROTEGIDAS.some((re) => re.test(p.Name))) return 'Componente protegido de Windows';
  return '';
}
const bonito = (n) => n.replace(/^Microsoft\./i, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[._]+/g, ' ').trim();
const editorDe = (pub) => ((String(pub || '').match(/CN=("[^"]+"|[^,]+)/) || [])[1] || '').replace(/"/g, '').trim();

async function sizeOf(dir, budget) {
  let t = 0, ents;
  try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of ents) {
    if (budget.n-- <= 0) return t; // shortcut: tope de archivos por paquete, el tamaño es aproximado
    const p = path.join(dir, e.name);
    if (e.isDirectory()) t += await sizeOf(p, budget);
    else if (e.isFile()) { try { t += (await fsp.stat(p)).size; } catch { /* sin acceso */ } }
  }
  return t;
}

const sesion = { apps: new Map(), caps: new Map() }; // lo último que se listó: solo eso se puede tocar

async function appList() {
  const rows = await U.psJson('try{$l=Get-AppxPackage -AllUsers}catch{$l=Get-AppxPackage}; $l | Select-Object Name,PackageFullName,Publisher,Version,IsFramework,NonRemovable,@{n="Sig";e={[string]$_.SignatureKind}},InstallLocation | ConvertTo-Json -Compress', {}, { timeout: 180000 });
  const vistos = new Map();
  for (const r of rows) {
    if (!r || !r.PackageFullName || vistos.has(r.PackageFullName) || appBloqueada(r)) continue;
    const av = AVISO.find(([re]) => re.test(r.Name)), rel = RELLENO.find(([re]) => re.test(r.Name)), op = OPCIONAL.find(([re]) => re.test(r.Name));
    vistos.set(r.PackageFullName, {
      full: r.PackageFullName, name: r.Name, nombre: (av || rel || op || [])[1] || bonito(r.Name), editor: editorDe(r.Publisher), version: r.Version || '',
      recomendada: !!rel && !av, aviso: av ? av[2] : '', _loc: r.InstallLocation || '', tamano: null
    });
  }
  const lista = [...vistos.values()], cola = lista.filter((a) => a._loc);
  await Promise.all(Array.from({ length: 6 }, async () => { for (let a; (a = cola.pop());) a.tamano = (await sizeOf(a._loc, { n: 20000 })) || null; }));
  sesion.apps = new Map(lista.map((a) => [a.full, { name: a.name, nombre: a.nombre, aviso: a.aviso }]));
  return lista.map(({ _loc, ...a }) => a).sort((a, b) => b.recomendada - a.recomendada || a.nombre.localeCompare(b.nombre, 'es'));
}

// Quita UN paquete. Solo acepta nombres completos del último listado y vuelve a comprobar la protección.
async function appRemove(full, perfilBase) {
  const a = sesion.apps.get(full);
  if (!a) return { ok: false, err: 'No está en el último listado: actualiza la lista.' };
  const mot = appBloqueada({ Name: a.name });
  if (mot) return { ok: false, err: mot };
  const r = await U.ps(`try{Remove-AppxPackage -Package $env:BARREDOR_PKG -AllUsers}catch{Write-Output ('ERR:'+$_.Exception.Message.Split([char]10)[0]);exit}
if($env:BARREDOR_PROV -eq '1'){try{Get-AppxProvisionedPackage -Online|Where-Object{$_.DisplayName -eq $env:BARREDOR_NAME}|Remove-AppxProvisionedPackage -Online|Out-Null}catch{Write-Output ('PROV:'+$_.Exception.Message.Split([char]10)[0])}}
Write-Output OK`, { BARREDOR_PKG: full, BARREDOR_NAME: a.name, BARREDOR_PROV: perfilBase ? '1' : '0' }, { timeout: 300000 });
  const out = r.out.trim();
  if (/^ERR:/m.test(out)) return { ok: false, err: out.match(/^ERR:(.*)$/m)[1].trim().slice(0, 300) };
  if (!r.ok && !/OK/.test(out)) return { ok: false, err: (r.err.trim().split('\n')[0] || 'Error desconocido').slice(0, 300) };
  sesion.apps.delete(full);
  const prov = out.match(/^PROV:(.*)$/m);
  return { ok: true, nota: prov ? 'quitada, pero no del perfil base: ' + prov[1].trim().slice(0, 200) : '' };
}
const appInfo = (full) => sesion.apps.get(full) || null;

// ---------- Características de Windows (lista blanca) ----------
// tipo 'f' = característica opcional (DISM), 'c' = capacidad. id: nombre de la característica o prefijo de la capacidad.
const FEATS = [
  { tipo: 'f', id: 'Internet-Explorer-Optional-amd64', nombre: 'Internet Explorer 11', desc: 'El navegador antiguo de Microsoft, que sigue incluido por compatibilidad.', perdida: 'Dejarán de abrir las pocas webs o programas antiguos que dependen de él.', reinicio: true },
  { tipo: 'f', id: 'WindowsMediaPlayer', nombre: 'Windows Media Player heredado', desc: 'El reproductor clásico de audio y vídeo de Windows.', perdida: 'No podrás usar el reproductor clásico ni sus bibliotecas; el reproductor nuevo no se ve afectado.', reinicio: true },
  { tipo: 'f', id: 'MediaPlayback', nombre: 'Funciones multimedia heredadas', desc: 'Componentes multimedia antiguos de los que cuelgan Windows Media Player y algunos códecs clásicos.', perdida: 'Algunos programas antiguos pueden dejar de reproducir ciertos formatos.', reinicio: true, aviso: 'Si usas Windows Media Player heredado, desactívalo primero o a la vez.' },
  { tipo: 'f', id: 'Printing-XPSServices-Features', nombre: 'Visor y servicios XPS', desc: 'Formato de documento XPS (una alternativa antigua al PDF) e impresora "Microsoft XPS Document Writer".', perdida: 'No podrás abrir archivos .xps ni imprimir a XPS.', reinicio: true },
  { tipo: 'f', id: 'WorkFolders-Client', nombre: 'Carpetas de trabajo', desc: 'Sincroniza carpetas con un servidor de empresa.', perdida: 'Si tu trabajo usa Carpetas de trabajo dejarán de sincronizarse. En un PC doméstico no se usa.', reinicio: false },
  { tipo: 'f', id: 'SMB1Protocol', nombre: 'SMB 1.0 / CIFS', desc: 'Protocolo antiguo e inseguro para compartir archivos en red. Es el que usó el ransomware WannaCry.', perdida: 'No podrás conectar con equipos, NAS o impresoras muy antiguos que solo hablen SMB1.', reinicio: true },
  { tipo: 'f', id: 'TelnetClient', nombre: 'Cliente Telnet', desc: 'Programa de consola para conectarse a servidores sin cifrar.', perdida: 'El comando telnet dejará de existir.', reinicio: false },
  { tipo: 'f', id: 'TFTP', nombre: 'Cliente TFTP', desc: 'Transferencia simple de archivos, usada en configuraciones de red y routers.', perdida: 'El comando tftp dejará de existir.', reinicio: false },
  { tipo: 'f', id: 'MicrosoftWindowsPowerShellV2Root', nombre: 'Windows PowerShell 2.0', desc: 'Versión antigua de PowerShell, que se suele usar para saltarse protecciones modernas.', perdida: 'Dejarán de funcionar scripts muy antiguos que exijan PowerShell 2.0. PowerShell 5.1 sigue ahí.', reinicio: false },
  { tipo: 'f', id: 'FaxServicesClientPackage', nombre: 'Fax y Escáner de Windows', desc: 'Programa clásico para enviar faxes y escanear.', perdida: 'No podrás usar "Fax y Escáner de Windows" (el escaneo desde el programa de tu escáner no se ve afectado).', reinicio: true },
  { tipo: 'f', id: 'Containers-DisposableClientVM', nombre: 'Windows Sandbox', desc: 'Un Windows desechable y aislado para probar programas sin riesgo (solo en Pro/Enterprise).', perdida: 'No podrás abrir Windows Sandbox.', reinicio: true },
  { tipo: 'f', id: 'Microsoft-Hyper-V-All', nombre: 'Hyper-V', desc: 'Tecnología de Microsoft para máquinas virtuales.', perdida: 'Desactivarlo desactiva tus máquinas virtuales de Hyper-V y puede afectar a WSL 2, Docker Desktop y emuladores Android.', reinicio: true, aviso: 'Atención: desactiva las máquinas virtuales de Hyper-V.' },
  { tipo: 'c', id: 'App.Support.QuickAssist~~~~', nombre: 'Asistencia rápida', desc: 'Permite que otra persona controle tu PC (o tú el suyo) para ayudar.', perdida: 'No podrás dar ni recibir ayuda remota con esta herramienta.', reinicio: false },
  { tipo: 'c', id: 'Microsoft.Windows.WordPad~~~~', nombre: 'WordPad', desc: 'Procesador de textos sencillo que viene con Windows.', perdida: 'No podrás abrir ni editar archivos .rtf con WordPad.', reinicio: false },
  { tipo: 'c', id: 'App.StepsRecorder~~~~', nombre: 'Grabadora de pasos', desc: 'Graba lo que haces con capturas para enseñar un problema.', perdida: 'No podrás usar psr.exe / Grabadora de pasos.', reinicio: false },
  { tipo: 'c', id: 'MathRecognizer~~~~', nombre: 'Reconocedor matemático', desc: 'Reconoce fórmulas escritas a mano en el Panel de entrada matemática.', perdida: 'No podrás escribir fórmulas a mano con el Panel de entrada matemática.', reinicio: false },
  { tipo: 'c', id: 'Browser.InternetExplorer~~~~', nombre: 'Modo Internet Explorer', desc: 'Componente de Edge que abre páginas antiguas con el motor de Internet Explorer.', perdida: 'Las webs que dependan del modo IE no se abrirán correctamente.', reinicio: false },
  { tipo: 'c', id: 'Media.WindowsMediaPlayer~~~~', nombre: 'Windows Media Player (capacidad)', desc: 'El reproductor clásico, en las versiones de Windows que lo ofrecen como capacidad.', perdida: 'No podrás usar el reproductor clásico.', reinicio: false }
];
const featDe = (id) => FEATS.find((f) => f.id === id) || null;

async function featList() {
  const [f, c] = await Promise.all([
    U.psJson('Get-WindowsOptionalFeature -Online | Select-Object FeatureName,@{n="State";e={[string]$_.State}} | ConvertTo-Json -Compress', {}, { timeout: 300000 }),
    U.psJson('Get-WindowsCapability -Online | Select-Object Name,@{n="State";e={[string]$_.State}} | ConvertTo-Json -Compress', {}, { timeout: 300000 })
  ]);
  const fm = new Map(f.map((x) => [x.FeatureName, x.State])), items = [];
  sesion.caps = new Map();
  for (const e of FEATS) {
    let st, real = e.id;
    if (e.tipo === 'f') st = fm.get(e.id);
    else { const x = c.find((y) => y && typeof y.Name === 'string' && y.Name.startsWith(e.id)); if (x) { st = x.State; real = x.Name; sesion.caps.set(e.id, x.Name); } }
    if (st == null) continue; // no existe en esta edición de Windows
    items.push({ ...e, activa: /^(Enabled|EnablePending|Installed)$/i.test(st), estado: st });
  }
  return items;
}

// Activa o desactiva UNA entrada de la lista blanca. accion: 'desactivar' | 'activar'.
async function featSet(id, accion) {
  const e = featDe(id);
  if (!e) return { ok: false, err: 'Entrada no permitida.' };
  const off = accion === 'desactivar';
  if (!off && accion !== 'activar') return { ok: false, err: 'Acción no válida.' };
  let script, nombre = e.id;
  if (e.tipo === 'f') script = off ? 'Disable-WindowsOptionalFeature -Online -FeatureName $env:BARREDOR_FEAT -NoRestart' : 'Enable-WindowsOptionalFeature -Online -FeatureName $env:BARREDOR_FEAT -All -NoRestart';
  else {
    nombre = sesion.caps.get(e.id);
    if (!nombre) return { ok: false, err: 'No está en el último listado: actualiza la lista.' };
    script = off ? 'Remove-WindowsCapability -Online -Name $env:BARREDOR_FEAT' : 'Add-WindowsCapability -Online -Name $env:BARREDOR_FEAT';
  }
  const r = await U.ps(`try{$r=${script}; if($r -and $r.RestartNeeded){Write-Output 'RESTART'}; Write-Output OK}catch{Write-Output ('ERR:'+$_.Exception.Message.Split([char]10)[0])}`, { BARREDOR_FEAT: nombre }, { timeout: 900000 });
  const out = r.out.trim();
  if (/^ERR:/m.test(out)) return { ok: false, err: out.match(/^ERR:(.*)$/m)[1].trim().slice(0, 300) };
  if (!/OK/.test(out)) return { ok: false, err: (r.err.trim().split('\n')[0] || 'Error desconocido').slice(0, 300) };
  return { ok: true, reinicio: /RESTART/.test(out) || e.reinicio };
}

module.exports = { appBloqueada, appList, appRemove, appInfo, featList, featSet, featDe, FEATS };
