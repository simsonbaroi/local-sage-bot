// PostgreSQL Database Setup for NeuroCore AI System
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '@shared/schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create connection pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Create Drizzle database instance
export const db = drizzle({ client: pool, schema });

// Helper function to test database connection
export async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    console.log('✅ PostgreSQL database connected successfully at:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

// Helper function to get database statistics
export function getStats() {
  return {
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingConnections: pool.waitingCount,
    database: 'PostgreSQL',
    driver: 'Neon Serverless',
    ssl: process.env.NODE_ENV === 'production'
  };
}

// Initialize database connection
testConnection().then((connected) => {
  if (connected) {
    console.log('🧠 NeuroCore AI Database System ready');
  } else {
    console.error('❌ Failed to initialize NeuroCore database');
    process.exit(1);
  }
});