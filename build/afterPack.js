// Incrusta el icono en Barredor.exe con rcedit (de la caché de electron-builder), sin pasar por la firma.
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
exports.default = async (ctx) => {
  const base = path.join(process.env.LOCALAPPDATA || os.homedir(), 'electron-builder', 'Cache', 'winCodeSign');
  const rc = fs.readdirSync(base).map((d) => path.join(base, d, 'rcedit-x64.exe')).find(fs.existsSync);
  if (!rc) throw new Error('rcedit no encontrado en ' + base);
  const exe = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.exe');
  execFileSync(rc, [exe, '--set-icon', path.join(__dirname, 'icon.ico'), '--set-version-string', 'ProductName', 'Barredor', '--set-version-string', 'FileDescription', 'Barredor']);
};
