import fs from 'node:fs/promises';
import path from 'node:path';

const [briefPath, outputPath] = process.argv.slice(2);

if (!briefPath || !outputPath) {
  console.error('Usage: node scripts/make-props.mjs <brief.json> <output.json>');
  process.exit(1);
}

const input = JSON.parse(await fs.readFile(briefPath, 'utf8'));
await fs.mkdir(path.dirname(outputPath), {recursive: true});
await fs.writeFile(outputPath, JSON.stringify(input, null, 2) + '\n');
console.log(`Props written to ${outputPath}`);
