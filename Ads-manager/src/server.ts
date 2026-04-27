import { env } from './config/env.js';
import { buildApp } from './app.js';

async function main() {
  const app = buildApp();

  try {
    await app.listen({
      port: env.PORT,
      host: '0.0.0.0'
    });
  } catch (error) {
    app.log.error({ err: error }, 'failed to start server');
    process.exit(1);
  }
}

void main();
