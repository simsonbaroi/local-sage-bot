// AI Assistant Types - Comprehensive type definitions

export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: number;
  language: 'en' | 'bn' | 'auto';
  confidence?: number;
  learningData?: LearningData;
}

export interface LearningData {
  keywords: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  importance: number;
  context: string[];
  responsePattern?: string;
}

export interface KnowledgeEntry {
  id: string;
  keywords: string[];
  responses: string[];
  patterns: string[];
  frequency: number;
  lastUsed: number;
  language: 'en' | 'bn' | 'both';
  confidence: number;
  source: 'conversation' | 'web' | 'manual';
}

export interface AIKnowledgeBase {
  version: string;
  lastUpdated: number;
  conversations: Message[];
  knowledge: KnowledgeEntry[];
  userPreferences: UserPreferences;
  stats: AIStats;
}

export interface UserPreferences {
  preferredLanguage: 'en' | 'bn' | 'auto';
  responseStyle: 'formal' | 'casual' | 'technical';
  learningMode: boolean;
  autoExport: boolean;
  webAccess: boolean;
}

export interface AIStats {
  totalConversations: number;
  totalMessages: number;
  knowledgeEntries: number;
  lastBackup: number;
  learningAccuracy: number;
  responseTime: number[];
}

export interface WebScrapeResult {
  url: string;
  title: string;
  content: string;
  timestamp: number;
  language: string;
  relevance: number;
}

export interface ExportData {
  timestamp: number;
  version: string;
  knowledgeBase: AIKnowledgeBase;
  filename: string;
}

export interface LanguageDetectionResult {
  language: 'en' | 'bn';
  confidence: number;
  isReliable: boolean;
}

export interface AIResponse {
  content: string;
  confidence: number;
  source: 'knowledge' | 'pattern' | 'web' | 'default';
  learningData: LearningData;
  suggestedActions?: string[];
}