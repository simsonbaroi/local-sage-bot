export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: number;
  language?: 'en' | 'bn' | 'auto';
  confidence?: number;
}

export interface AIResponse {
  content: string;
  confidence: number;
  language: 'en' | 'bn' | 'auto';
  metadata?: any;
}

export interface KnowledgeEntry {
  id: string;
  question: string;
  answer: string;
  timestamp: number;
  language: 'en' | 'bn' | 'auto';
  tags?: string[];
}

export interface KnowledgeBase {
  knowledge: KnowledgeEntry[];
  stats: {
    totalConversations: number;
    lastUpdated: number;
  };
}