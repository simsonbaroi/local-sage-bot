// Permanent Storage System - Multiple persistence layers for bulletproof data retention

import { AIKnowledgeBase, ExportData, Message, KnowledgeEntry } from '@/types/ai';

class PermanentStorage {
  private dbName = 'AIAssistantDB';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;

  constructor() {
    this.initializeDB();
  }

  // Initialize IndexedDB for permanent storage
  private async initializeDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create stores for different data types
        if (!db.objectStoreNames.contains('knowledge')) {
          const knowledgeStore = db.createObjectStore('knowledge', { keyPath: 'id' });
          knowledgeStore.createIndex('keywords', 'keywords', { multiEntry: true });
          knowledgeStore.createIndex('language', 'language');
        }

        if (!db.objectStoreNames.contains('conversations')) {
          const conversationStore = db.createObjectStore('conversations', { keyPath: 'id' });
          conversationStore.createIndex('timestamp', 'timestamp');
          conversationStore.createIndex('sender', 'sender');
        }

        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains('backups')) {
          const backupStore = db.createObjectStore('backups', { keyPath: 'timestamp' });
          backupStore.createIndex('version', 'version');
        }
      };
    });
  }

  // Save knowledge base with version control
  async saveKnowledgeBase(knowledgeBase: AIKnowledgeBase): Promise<void> {
    if (!this.db) await this.initializeDB();

    const transaction = this.db!.transaction(['knowledge', 'conversations', 'settings'], 'readwrite');
    
    // Save knowledge entries
    const knowledgeStore = transaction.objectStore('knowledge');
    for (const entry of knowledgeBase.knowledge) {
      await this.promisifyRequest(knowledgeStore.put(entry));
    }

    // Save conversations
    const conversationStore = transaction.objectStore('conversations');
    for (const message of knowledgeBase.conversations) {
      await this.promisifyRequest(conversationStore.put(message));
    }

    // Save settings
    const settingsStore = transaction.objectStore('settings');
    await this.promisifyRequest(settingsStore.put({
      key: 'userPreferences',
      value: knowledgeBase.userPreferences
    }));
    await this.promisifyRequest(settingsStore.put({
      key: 'stats',
      value: knowledgeBase.stats
    }));
    await this.promisifyRequest(settingsStore.put({
      key: 'lastUpdated',
      value: knowledgeBase.lastUpdated
    }));

    // Auto-backup if enabled
    if (knowledgeBase.userPreferences.autoExport) {
      await this.createBackup(knowledgeBase);
    }
  }

  // Load complete knowledge base
  async loadKnowledgeBase(): Promise<AIKnowledgeBase | null> {
    if (!this.db) await this.initializeDB();

    try {
      const transaction = this.db!.transaction(['knowledge', 'conversations', 'settings'], 'readonly');
      
      // Load all knowledge entries
      const knowledgeStore = transaction.objectStore('knowledge');
      const knowledge = await this.promisifyRequest(knowledgeStore.getAll()) as KnowledgeEntry[];

      // Load all conversations
      const conversationStore = transaction.objectStore('conversations');
      const conversations = await this.promisifyRequest(conversationStore.getAll()) as Message[];

      // Load settings
      const settingsStore = transaction.objectStore('settings');
      const userPreferences = await this.promisifyRequest(settingsStore.get('userPreferences'));
      const stats = await this.promisifyRequest(settingsStore.get('stats'));
      const lastUpdated = await this.promisifyRequest(settingsStore.get('lastUpdated'));

      return {
        version: '1.0.0',
        lastUpdated: lastUpdated?.value || Date.now(),
        conversations: conversations.sort((a, b) => a.timestamp - b.timestamp),
        knowledge: knowledge.sort((a, b) => b.frequency - a.frequency),
        userPreferences: userPreferences?.value || this.getDefaultPreferences(),
        stats: stats?.value || this.getDefaultStats()
      };
    } catch (error) {
      console.error('Error loading knowledge base:', error);
      return null;
    }
  }

  // Create versioned backup
  async createBackup(knowledgeBase: AIKnowledgeBase): Promise<void> {
    if (!this.db) await this.initializeDB();

    const backup: ExportData = {
      timestamp: Date.now(),
      version: knowledgeBase.version,
      knowledgeBase,
      filename: `ai_backup_${new Date().toISOString().split('T')[0]}.json`
    };

    const transaction = this.db!.transaction(['backups'], 'readwrite');
    const backupStore = transaction.objectStore('backups');
    await this.promisifyRequest(backupStore.put(backup));

    // Keep only last 10 backups
    const allBackups = await this.promisifyRequest(backupStore.getAll()) as ExportData[];
    if (allBackups.length > 10) {
      const oldestBackups = allBackups
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(0, allBackups.length - 10);
      
      for (const oldBackup of oldestBackups) {
        await this.promisifyRequest(backupStore.delete(oldBackup.timestamp));
      }
    }
  }

  // Export knowledge base to downloadable file
  async exportToFile(knowledgeBase: AIKnowledgeBase): Promise<void> {
    const exportData: ExportData = {
      timestamp: Date.now(),
      version: knowledgeBase.version,
      knowledgeBase,
      filename: `ai_knowledge_export_${new Date().toISOString().split('T')[0]}.json`
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportData.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Import knowledge base from file
  async importFromFile(file: File): Promise<AIKnowledgeBase | null> {
    try {
      const text = await file.text();
      const exportData: ExportData = JSON.parse(text);
      
      if (exportData.knowledgeBase && exportData.version) {
        await this.saveKnowledgeBase(exportData.knowledgeBase);
        return exportData.knowledgeBase;
      }
      return null;
    } catch (error) {
      console.error('Error importing file:', error);
      return null;
    }
  }

  // Search knowledge by keywords
  async searchKnowledge(keywords: string[], language?: 'en' | 'bn'): Promise<KnowledgeEntry[]> {
    if (!this.db) await this.initializeDB();

    const transaction = this.db!.transaction(['knowledge'], 'readonly');
    const store = transaction.objectStore('knowledge');
    const index = store.index('keywords');

    const results: KnowledgeEntry[] = [];
    for (const keyword of keywords) {
      const entries = await this.promisifyRequest(index.getAll(keyword.toLowerCase())) as KnowledgeEntry[];
      results.push(...entries);
    }

    // Filter by language if specified
    const filtered = language 
      ? results.filter(entry => entry.language === language || entry.language === 'both')
      : results;

    // Remove duplicates and sort by relevance
    const unique = filtered.filter((entry, index, self) => 
      index === self.findIndex(e => e.id === entry.id)
    );

    return unique.sort((a, b) => b.confidence * b.frequency - a.confidence * a.frequency);
  }

  // Get conversation history
  async getConversationHistory(limit: number = 100): Promise<Message[]> {
    if (!this.db) await this.initializeDB();

    const transaction = this.db!.transaction(['conversations'], 'readonly');
    const store = transaction.objectStore('conversations');
    const index = store.index('timestamp');

    const messages = await this.promisifyRequest(index.getAll()) as Message[];
    return messages
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // Clear all data (with confirmation)
  async clearAllData(): Promise<void> {
    if (!this.db) await this.initializeDB();

    const transaction = this.db!.transaction(['knowledge', 'conversations', 'settings', 'backups'], 'readwrite');
    
    await Promise.all([
      this.promisifyRequest(transaction.objectStore('knowledge').clear()),
      this.promisifyRequest(transaction.objectStore('conversations').clear()),
      this.promisifyRequest(transaction.objectStore('settings').clear()),
      this.promisifyRequest(transaction.objectStore('backups').clear())
    ]);
  }

  // Utility: Convert IDBRequest to Promise
  private promisifyRequest(request: IDBRequest): Promise<any> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Default preferences
  private getDefaultPreferences() {
    return {
      preferredLanguage: 'auto' as const,
      responseStyle: 'casual' as const,
      learningMode: true,
      autoExport: true,
      webAccess: true
    };
  }

  // Default stats
  private getDefaultStats() {
    return {
      totalConversations: 0,
      totalMessages: 0,
      knowledgeEntries: 0,
      lastBackup: 0,
      learningAccuracy: 0.5,
      responseTime: []
    };
  }
}

export const permanentStorage = new PermanentStorage();
