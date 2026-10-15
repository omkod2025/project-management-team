import next from 'next';
import { createServer } from 'node:http';
const app = next({ dev: true, webpack: true, dir: process.env.PEOPLE_TEST_APP_DIR, conf: { devIndicators: false } });
await app.prepare();
createServer(app.getRequestHandler()).listen(3011, '127.0.0.1', () => console.log('TEST_SERVER_READY'));
