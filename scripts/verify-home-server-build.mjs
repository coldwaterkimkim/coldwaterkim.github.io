import fs from 'fs';
import path from 'path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const bannedPatterns = [
  'cdn.jsdelivr.net',
  'https://api.coldwaterkim.com',
  'http://api.coldwaterkim.com',
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (!fs.existsSync(dist)) {
  fail('dist/ does not exist. Run the iMac build first.');
  process.exit();
}

const files = walk(dist).filter(file => /\.(html|js|css|json)$/.test(file));

for (const file of files) {
  const body = fs.readFileSync(file, 'utf8');
  for (const pattern of bannedPatterns) {
    if (body.includes(pattern)) {
      fail(`Banned runtime dependency found: ${pattern} in ${path.relative(root, file)}`);
    }
  }
}

const manifest = path.join(dist, 'site-version.json');
if (!fs.existsSync(manifest)) {
  fail('Missing dist/site-version.json');
}

if (process.exitCode) {
  process.exit();
}

console.log(`Home server build verified (${files.length} files scanned).`);
