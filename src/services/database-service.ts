import Database from 'better-sqlite3';
import { createRequire } from 'node:module';
import path from 'node:path';

import { Logger } from './logger.js';

const require = createRequire(import.meta.url);
let Config = require('../../config/config.json');

const DB_PATH =
    (Config as { database?: { path?: string } }).database?.path ??
    path.resolve(process.cwd(), 'data', 'sufbot.db');

let db: Database.Database | undefined;

export function getDatabase(): Database.Database {
    if (db) {
        return db;
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    initSchema(db);
    Logger.info(`Database initialized at ${DB_PATH}.`);
    return db;
}

function initSchema(database: Database.Database): void {
    database.exec(`
        CREATE TABLE IF NOT EXISTS cases (
            case_id      INTEGER NOT NULL,
            guild_id     TEXT    NOT NULL,
            target_id    TEXT    NOT NULL,
            moderator_id TEXT    NOT NULL,
            action       TEXT    NOT NULL,
            reason       TEXT    NOT NULL DEFAULT 'No reason provided.',
            duration_ms  INTEGER,
            active       INTEGER NOT NULL DEFAULT 1,
            created_at   INTEGER NOT NULL,
            PRIMARY KEY (guild_id, case_id)
        );

        CREATE TABLE IF NOT EXISTS warnings (
            warning_id    INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id       INTEGER NOT NULL,
            guild_id      TEXT    NOT NULL,
            user_id       TEXT    NOT NULL,
            moderator_id  TEXT    NOT NULL,
            reason        TEXT    NOT NULL DEFAULT 'No reason provided.',
            created_at    INTEGER NOT NULL,
            FOREIGN KEY (guild_id, case_id) REFERENCES cases (guild_id, case_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS case_counters (
            guild_id TEXT PRIMARY KEY,
            next_id  INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS channel_locks (
            channel_id TEXT PRIMARY KEY,
            guild_id   TEXT NOT NULL,
            payload    TEXT NOT NULL,
            locked_at  INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_cases_guild_target
            ON cases (guild_id, target_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_warnings_guild_user
            ON warnings (guild_id, user_id, created_at DESC);
    `);
}

export function closeDatabase(): void {
    if (db) {
        db.close();
        db = undefined;
    }
}
