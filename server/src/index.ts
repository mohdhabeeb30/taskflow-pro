import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { openDatabase } from './db/database.js';
import { createApp } from './api/app.js';

if (existsSync('.env')) process.loadEnvFile?.();
const db = openDatabase();
const port = Number(process.env.PORT ?? 3000);
const server = createServer(createApp(db));
server.listen(port, () => console.log(`TaskFlow Pro listening on http://localhost:${port}`));

function shutdown(): void {
  server.close(() => db.close());
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
