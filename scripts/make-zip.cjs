/**
 * Cria zip de deploy com paths POSIX (forward slash) para compatibilidade
 * com Linux/Oryx. PowerShell Compress-Archive gera paths com backslash
 * literal que quebram a extração no App Service Linux.
 */
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

const src = process.argv[2] || 'C:/Users/RaphaelAndrade/AppData/Local/Temp/deploy-slim';
const dst = process.argv[3] || 'C:/Users/RaphaelAndrade/AppData/Local/Temp/bolao-linux.zip';

function walk(dir, baseDir) {
  baseDir = baseDir || dir;
  let files = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files = files.concat(walk(full, baseDir));
    else files.push({
      full,
      // CRÍTICO: normaliza para forward slash sempre (compatibilidade Linux)
      rel: path.relative(baseDir, full).split(path.sep).join('/'),
    });
  }
  return files;
}

const files = walk(src);
console.log(`Files found: ${files.length}`);
console.log(`Source: ${src}`);
console.log(`Output: ${dst}`);

const out = fs.createWriteStream(dst);
const archive = archiver('zip', { zlib: { level: 6 } });

let lastProgress = 0;
archive.pipe(out);

out.on('close', () => {
  console.log(`CLOSED ${archive.pointer()} bytes (${files.length} files)`);
});

archive.on('error', (e) => {
  console.error('ERR', e.message);
  process.exit(1);
});

archive.on('progress', (p) => {
  if (p.entries.processed - lastProgress >= 100 || p.entries.processed === p.entries.total) {
    console.log(`progress ${p.entries.processed}/${p.entries.total}`);
    lastProgress = p.entries.processed;
  }
});

for (const f of files) {
  // Pass forward-slash path explicitly
  archive.file(f.full, { name: f.rel });
}

archive.finalize();
