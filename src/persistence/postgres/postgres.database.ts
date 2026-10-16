import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type {
  NodePgDatabase,
  NodePgTransaction,
} from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { join } from 'node:path';
import { Pool } from 'pg';
import * as schema from './drizzle.schema';
import type { ApplicationConfig } from '../../config/configuration';

export class PostgresUnavailableError extends Error {
  constructor() {
    super('Postgres persistence is not enabled.');
    this.name = 'PostgresUnavailableError';
  }
}

export type FeedbackDatabase = NodePgDatabase<typeof schema>;
export type FeedbackTransaction = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** Nest copies migration assets next to the compiled database adapter. */
export function postgresMigrationsFolder(runtimeDirectory: string): string {
  return join(runtimeDirectory, 'drizzle');
}

/** One shared PostgreSQL pool wrapped by Drizzle for backend-owned data. */
@Injectable()
export class PostgresDatabase implements OnModuleInit, OnModuleDestroy {
  private pool: Pool | undefined;
  private database: FeedbackDatabase | undefined;

  constructor(
    private readonly config: ConfigService<ApplicationConfig, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    const configuration = this.config.get('postgres', { infer: true });
    if (!configuration.enabled) return;

    const pool = new Pool({
      host: configuration.host,
      port: configuration.port,
      database: configuration.database,
      user: configuration.user,
      password: configuration.password,
      max: 10,
      application_name: 'architecture-sample-backend',
    });
    const database = drizzle(pool, { schema });

    try {
      await database.execute('select 1');
      await migrate(database, {
        migrationsFolder: postgresMigrationsFolder(__dirname),
      });
      this.pool = pool;
      this.database = database;
    } catch (error: unknown) {
      await pool.end();
      throw new Error('Postgres initialization or Drizzle migration failed.', {
        cause: error,
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
    this.pool = undefined;
    this.database = undefined;
  }

  getDatabase(): FeedbackDatabase {
    if (this.database === undefined) throw new PostgresUnavailableError();
    return this.database;
  }
}
