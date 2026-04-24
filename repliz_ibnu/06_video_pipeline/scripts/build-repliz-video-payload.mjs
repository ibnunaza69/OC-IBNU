import fs from 'node:fs';
import path from 'node:path';

const [videoPath, metaPath, outputPath] = process.argv.slice(2);

if (!videoPath || !metaPath || !outputPath) {
  console.error('Usage: node scripts/build-repliz-video-payload.mjs <videoPath> <meta.json> <output.json>');
  process.exit(1);
}

const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
const payload = {
  title: meta.title || '',
  description: meta.description || '',
  type: 'video',
  medias: [
    {
      type: 'video',
      url: videoPath,
      thumbnail: meta.thumbnail || '',
    }
  ],
  scheduleAt: meta.scheduleAt || '',
  accountId: meta.accountId || ''
};

fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\n');
console.log(`Payload written to ${outputPath}`);
