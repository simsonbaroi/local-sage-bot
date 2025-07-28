import Database from 'better-sqlite3';
import { join } from 'path';
import bcrypt from 'bcryptjs';

export interface DatabaseConfig {
  path: string;
  memory?: boolean;
  readonly?: boolean;
  fileMustExist?: boolean;
}

export class SQLiteDatabase {
  private db: Database.Database;

  constructor(config: DatabaseConfig = { path: 'data/app.db' }) {
    // Ensure data directory exists
    const fs = require('fs');
    const path = require('path');
    
    if (!config.memory) {
      const dir = path.dirname(config.path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(config.memory ? ':memory:' : config.path, {
      readonly: config.readonly,
      fileMustExist: config.fileMustExist,
    });

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 1000000');
    this.db.pragma('temp_store = MEMORY');

    this.initializeTables();
    this.seedDefaultData();
  }

  private initializeTables() {
    // Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        display_name TEXT,
        avatar TEXT,
        role TEXT DEFAULT 'user',
        is_active BOOLEAN DEFAULT 1,
        preferences TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Chat rooms table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        is_private BOOLEAN DEFAULT 0,
        owner_id INTEGER,
        settings TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );
    `);

    // Messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER,
        user_id INTEGER,
        content TEXT NOT NULL,
        message_type TEXT DEFAULT 'text',
        metadata TEXT DEFAULT '{}',
        is_edited BOOLEAN DEFAULT 0,
        is_deleted BOOLEAN DEFAULT 0,
        parent_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (parent_id) REFERENCES messages(id)
      );
    `);

    // AI conversations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT,
        summary TEXT,
        language TEXT DEFAULT 'en',
        model TEXT DEFAULT 'gpt-3.5-turbo',
        system_prompt TEXT,
        settings TEXT DEFAULT '{}',
        is_archived BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    // AI messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        tokens INTEGER,
        cost TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id)
      );
    `);

    // Knowledge base table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT,
        category TEXT,
        embedding TEXT,
        is_public BOOLEAN DEFAULT 0,
        language TEXT DEFAULT 'en',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    // Files table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        path TEXT NOT NULL,
        hash TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER,
        expires_at DATETIME NOT NULL,
        data TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    // Analytics table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        event TEXT NOT NULL,
        data TEXT DEFAULT '{}',
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
      CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
      CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id ON ai_messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_base_user_id ON knowledge_base(user_id);
      CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics(user_id);
      CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics(event);
    `);
  }

  private seedDefaultData() {
    // Check if we already have users
    const userCount = this.db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    
    if (userCount.count === 0) {
      // Create default admin user
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      this.db.prepare(`
        INSERT INTO users (username, email, password, display_name, role, preferences)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'admin',
        'admin@localhost',
        hashedPassword,
        'System Administrator',
        'admin',
        JSON.stringify({
          theme: 'dark',
          language: 'en',
          aiModel: 'gpt-3.5-turbo',
          responseStyle: 'technical',
          enableNotifications: true,
          autoSave: true,
          showTimestamps: true
        })
      );

      // Create default guest user
      const guestPassword = bcrypt.hashSync('guest123', 10);
      this.db.prepare(`
        INSERT INTO users (username, email, password, display_name, role, preferences)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'guest',
        'guest@localhost',
        guestPassword,
        'Guest User',
        'user',
        JSON.stringify({
          theme: 'light',
          language: 'auto',
          aiModel: 'gpt-3.5-turbo',
          responseStyle: 'casual',
          enableNotifications: false,
          autoSave: true,
          showTimestamps: false
        })
      );

      // Create default public chat room
      this.db.prepare(`
        INSERT INTO chat_rooms (name, description, is_private, owner_id, settings)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        'General Chat',
        'Welcome to the general chat room! This is a public space for everyone to chat.',
        0,
        1, // admin user
        JSON.stringify({
          allowFileUploads: true,
          maxMessageLength: 5000,
          moderationEnabled: true,
          welcomeMessage: 'Welcome to General Chat!'
        })
      );

      console.log('✅ Default users and chat room created');
    }
  }

  // Generic query methods
  prepare(sql: string) {
    return this.db.prepare(sql);
  }

  exec(sql: string) {
    return this.db.exec(sql);
  }

  transaction(fn: () => void) {
    return this.db.transaction(fn);
  }

  close() {
    return this.db.close();
  }

  // Backup and restore
  backup(path: string) {
    return this.db.backup(path);
  }

  // Utility methods
  getTableInfo(tableName: string) {
    return this.db.prepare(`PRAGMA table_info(${tableName})`).all();
  }

  getTables() {
    return this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();
  }

  getStats() {
    const tables = this.getTables() as { name: string }[];
    const stats: Record<string, number> = {};
    
    for (const table of tables) {
      const result = this.db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get() as { count: number };
      stats[table.name] = result.count;
    }
    
    return stats;
  }
}

// Create singleton instance
export const database = new SQLiteDatabase({
  path: process.env.NODE_ENV === 'production' ? 'data/production.db' : 'data/development.db'
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Closing database connection...');
  database.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Closing database connection...');
  database.close();
  process.exit(0);
});