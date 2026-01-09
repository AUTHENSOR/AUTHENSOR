import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

const connectionString =
  process.env.DATABASE_URL || 'postgres://authensor:authensor_dev@localhost:5432/authensor';

export const db = new Pool({ connectionString });

export async function initDb(): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const candidateDirs = [
    path.resolve(__dirname, 'migrations'), // dist bundle
    path.resolve(__dirname, '..', 'src', 'migrations'), // ts-dev
  ];

  const migrationsDir = candidateDirs.find((p) => fs.existsSync(p));
  if (!migrationsDir) {
    throw new Error('Database migration directory not found');
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const ddl = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`[db] applying migration ${file}`);
    // pg-mem lacks gen_random_uuid/uuid_generate_v4, so register no-op UDFs for tests
    if ((db as any).public?.registerFunction) {
      (db as any).public.registerFunction({
        name: 'gen_random_uuid',
        returns: 'uuid',
        implementation: () => crypto.randomUUID(),
      });
      (db as any).public.registerFunction({
        name: 'uuid_generate_v4',
        returns: 'uuid',
        implementation: () => crypto.randomUUID(),
      });
    }
    await db.query(ddl);
  }
}
