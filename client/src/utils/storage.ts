import { Message, KnowledgeBase, KnowledgeEntry } from '@/types/ai';

class PermanentStorage {
  private storageKey = 'ai-assistant-data';

  async getConversationHistory(limit: number = 50): Promise<Message[]> {
    try {
      const data = localStorage.getItem(`${this.storageKey}-messages`);
      if (!data) return [];
      
      const messages: Message[] = JSON.parse(data);
      return messages.slice(-limit);
    } catch (error) {
      console.error('Failed to load conversation history:', error);
      return [];
    }
  }

  async saveMessage(message: Message): Promise<void> {
    try {
      const existing = await this.getConversationHistory(1000);
      const updated = [...existing, message];
      localStorage.setItem(`${this.storageKey}-messages`, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  }

  async loadKnowledgeBase(): Promise<KnowledgeBase | null> {
    try {
      const data = localStorage.getItem(`${this.storageKey}-knowledge`);
      if (!data) {
        return {
          knowledge: [],
          stats: {
            totalConversations: 0,
            lastUpdated: Date.now()
          }
        };
      }
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to load knowledge base:', error);
      return null;
    }
  }

  async saveKnowledgeEntry(entry: KnowledgeEntry): Promise<void> {
    try {
      const kb = await this.loadKnowledgeBase() || {
        knowledge: [],
        stats: { totalConversations: 0, lastUpdated: Date.now() }
      };
      
      kb.knowledge.push(entry);
      kb.stats.lastUpdated = Date.now();
      
      localStorage.setItem(`${this.storageKey}-knowledge`, JSON.stringify(kb));
    } catch (error) {
      console.error('Failed to save knowledge entry:', error);
    }
  }

  async exportData(): Promise<string> {
    try {
      const messages = await this.getConversationHistory(1000);
      const knowledge = await this.loadKnowledgeBase();
      
      const exportData = {
        messages,
        knowledge,
        exportedAt: Date.now()
      };
      
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Failed to export data:', error);
      return '{}';
    }
  }

  async importData(jsonData: string): Promise<boolean> {
    try {
      const data = JSON.parse(jsonData);
      
      if (data.messages) {
        localStorage.setItem(`${this.storageKey}-messages`, JSON.stringify(data.messages));
      }
      
      if (data.knowledge) {
        localStorage.setItem(`${this.storageKey}-knowledge`, JSON.stringify(data.knowledge));
      }
      
      return true;
    } catch (error) {
      console.error('Failed to import data:', error);
      return false;
    }
  }

  async clearAll(): Promise<void> {
    localStorage.removeItem(`${this.storageKey}-messages`);
    localStorage.removeItem(`${this.storageKey}-knowledge`);
  }
}

export const permanentStorage = new PermanentStorage();