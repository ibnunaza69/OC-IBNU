import { randomBytes, scryptSync } from 'node:crypto';

const password = process.argv[2];

if (!password || password.trim().length < 8) {
  console.error('Usage: npm run dashboard:hash-password -- "your-strong-password"');
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
console.log(`scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`);
