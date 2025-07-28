// AI Learning Engine - Self-improving intelligence with pattern recognition

import { Message, KnowledgeEntry, AIResponse, LearningData, LanguageDetectionResult } from '@/types/ai';
import { permanentStorage } from './storage';

export class AIEngine {
  private knowledgeBase: KnowledgeEntry[] = [];
  private conversationHistory: Message[] = [];
  private learningEnabled = true;

  // Bengali/English common words for language detection
  private readonly bengaliPatterns = [
    'আমি', 'তুমি', 'তিনি', 'আপনি', 'এই', 'সেই', 'কি', 'কেন', 'কোথায়', 'কখন',
    'হ্যাঁ', 'না', 'ভাল', 'খারাপ', 'সুন্দর', 'বাংলা', 'বাংলাদেশ', 'ধন্যবাদ'
  ];

  private readonly englishPatterns = [
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that', 'what', 'why', 'where', 'when',
    'yes', 'no', 'good', 'bad', 'nice', 'english', 'thank', 'please', 'hello', 'hi'
  ];

  // Default responses in both languages
  private readonly defaultResponses = {
    en: [
      "I understand what you're saying. Let me learn from this conversation.",
      "That's interesting! I'm adding this to my knowledge base.",
      "I'm still learning about this topic. Can you tell me more?",
      "Based on our previous conversations, I think you might be interested in...",
      "I don't have enough information about this yet, but I'm learning!"
    ],
    bn: [
      "আমি বুঝতে পারছি আপনি কী বলছেন। আমি এই কথোপকথন থেকে শিখছি।",
      "এটা আকর্ষণীয়! আমি এটি আমার জ্ঞানভান্ডারে যোগ করছি।",
      "আমি এই বিষয়ে এখনও শিখছি। আপনি কি আরও বলতে পারেন?",
      "আমাদের আগের কথোপকথনের ভিত্তিতে, আমি মনে করি আপনি আগ্রহী হতে পারেন...",
      "এই বিষয়ে আমার এখনও পর্যাপ্ত তথ্য নেই, কিন্তু আমি শিখছি!"
    ]
  };

  async initialize(): Promise<void> {
    const savedKB = await permanentStorage.loadKnowledgeBase();
    if (savedKB) {
      this.knowledgeBase = savedKB.knowledge;
      this.conversationHistory = savedKB.conversations;
      this.learningEnabled = savedKB.userPreferences.learningMode;
    }
  }

  // Process user input and generate AI response
  async processMessage(userMessage: string): Promise<AIResponse> {
    const startTime = Date.now();
    
    // Detect language
    const languageDetection = this.detectLanguage(userMessage);
    
    // Extract learning data from user message
    const learningData = this.extractLearningData(userMessage, languageDetection.language);
    
    // Search for relevant knowledge
    const relevantKnowledge = await this.findRelevantKnowledge(learningData.keywords, languageDetection.language);
    
    // Generate response
    const response = await this.generateResponse(userMessage, relevantKnowledge, languageDetection.language);
    
    // Learn from this interaction
    if (this.learningEnabled) {
      await this.learnFromInteraction(userMessage, response.content, learningData, languageDetection.language);
    }

    const responseTime = Date.now() - startTime;
    
    return {
      ...response,
      learningData
    };
  }

  // Detect language with confidence scoring
  private detectLanguage(text: string): LanguageDetectionResult {
    const normalizedText = text.toLowerCase();
    let bengaliMatches = 0;
    let englishMatches = 0;

    // Check for Bengali patterns
    for (const pattern of this.bengaliPatterns) {
      if (normalizedText.includes(pattern)) {
        bengaliMatches++;
      }
    }

    // Check for English patterns
    for (const pattern of this.englishPatterns) {
      if (normalizedText.includes(pattern)) {
        englishMatches++;
      }
    }

    // Check for Bengali Unicode range
    const bengaliChars = text.match(/[\u0980-\u09FF]/g);
    if (bengaliChars && bengaliChars.length > 3) {
      bengaliMatches += bengaliChars.length / 2;
    }

    // Check for English alphabet dominance
    const englishChars = text.match(/[a-zA-Z]/g);
    if (englishChars && englishChars.length > 3) {
      englishMatches += englishChars.length / 10;
    }

    const totalMatches = bengaliMatches + englishMatches;
    const confidence = totalMatches > 0 ? Math.max(bengaliMatches, englishMatches) / totalMatches : 0.5;

    return {
      language: bengaliMatches > englishMatches ? 'bn' : 'en',
      confidence,
      isReliable: confidence > 0.6 && totalMatches > 2
    };
  }

  // Extract learning data from user input
  private extractLearningData(text: string, language: 'en' | 'bn'): LearningData {
    // Extract keywords (remove common stop words)
    const stopWords = language === 'en' 
      ? ['the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'in', 'with', 'to', 'for', 'of', 'as', 'by']
      : ['এর', 'এবং', 'বা', 'কিন্তু', 'তবে', 'যে', 'যা', 'করে', 'হয়', 'আছে', 'ছিল', 'হবে'];

    const words = text.toLowerCase()
      .replace(/[^\w\s\u0980-\u09FF]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));

    const keywords = [...new Set(words)]; // Remove duplicates

    // Simple sentiment analysis
    const positiveWords = language === 'en' 
      ? ['good', 'great', 'excellent', 'amazing', 'wonderful', 'love', 'like', 'happy', 'pleased']
      : ['ভাল', 'ভালো', 'চমৎকার', 'দুর্দান্ত', 'সুন্দর', 'পছন্দ', 'খুশি', 'আনন্দ'];

    const negativeWords = language === 'en'
      ? ['bad', 'terrible', 'awful', 'hate', 'dislike', 'sad', 'angry', 'disappointed']
      : ['খারাপ', 'ভয়ানক', 'ঘৃণা', 'দুঃখ', 'রাগ', 'হতাশ'];

    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    const positiveMatches = positiveWords.filter(word => text.toLowerCase().includes(word)).length;
    const negativeMatches = negativeWords.filter(word => text.toLowerCase().includes(word)).length;

    if (positiveMatches > negativeMatches) sentiment = 'positive';
    else if (negativeMatches > positiveMatches) sentiment = 'negative';

    // Calculate importance based on length, question marks, exclamations
    let importance = Math.min(text.length / 100, 1); // Base importance on length
    if (text.includes('?')) importance += 0.2; // Questions are important
    if (text.includes('!')) importance += 0.1; // Exclamations add importance
    if (keywords.length > 5) importance += 0.2; // Rich content is important

    return {
      keywords,
      sentiment,
      importance: Math.min(importance, 1),
      context: this.getRecentContext(),
      responsePattern: this.identifyResponsePattern(text, language)
    };
  }

  // Find relevant knowledge entries
  private async findRelevantKnowledge(keywords: string[], language: 'en' | 'bn'): Promise<KnowledgeEntry[]> {
    const relevantEntries = await permanentStorage.searchKnowledge(keywords, language);
    
    // Score entries based on keyword matches and recency
    return relevantEntries
      .map(entry => ({
        ...entry,
        score: this.calculateRelevanceScore(entry, keywords)
      }))
      .sort((a, b) => (b as any).score - (a as any).score)
      .slice(0, 5); // Top 5 most relevant
  }

  // Calculate relevance score for knowledge entries
  private calculateRelevanceScore(entry: KnowledgeEntry, searchKeywords: string[]): number {
    let score = 0;
    
    // Keyword matching score
    const matchingKeywords = entry.keywords.filter(keyword => 
      searchKeywords.some(search => 
        keyword.includes(search.toLowerCase()) || search.toLowerCase().includes(keyword)
      )
    );
    score += matchingKeywords.length * 10;

    // Frequency bonus
    score += Math.log(entry.frequency + 1) * 5;

    // Confidence bonus
    score += entry.confidence * 10;

    // Recency bonus (entries used recently get higher score)
    const daysSinceLastUsed = (Date.now() - entry.lastUsed) / (1000 * 60 * 60 * 24);
    score += Math.max(0, 10 - daysSinceLastUsed);

    return score;
  }

  // Generate AI response
  private async generateResponse(userMessage: string, relevantKnowledge: KnowledgeEntry[], language: 'en' | 'bn'): Promise<Omit<AIResponse, 'learningData'>> {
    let confidence = 0.3; // Base confidence
    let source: 'knowledge' | 'pattern' | 'web' | 'default' = 'default';
    let content = '';

    if (relevantKnowledge.length > 0) {
      // Use knowledge-based response
      const bestMatch = relevantKnowledge[0];
      content = this.adaptResponse(bestMatch.responses[0], userMessage, language);
      confidence = bestMatch.confidence * 0.8;
      source = 'knowledge';
      
      // Update usage frequency
      bestMatch.frequency++;
      bestMatch.lastUsed = Date.now();
    } else if (await this.shouldUseWebSearch(userMessage)) {
      // Try web search for factual queries
      const webResult = await this.searchWeb(userMessage, language);
      if (webResult) {
        content = webResult;
        confidence = 0.7;
        source = 'web';
      }
    }

    // Fallback to pattern matching or default response
    if (!content) {
      content = this.generatePatternResponse(userMessage, language);
      if (content !== this.getRandomDefaultResponse(language)) {
        confidence = 0.5;
        source = 'pattern';
      }
    }

    return {
      content,
      confidence,
      source,
      suggestedActions: this.generateSuggestedActions(userMessage, language)
    };
  }

  // Learn from interaction and update knowledge base
  private async learnFromInteraction(
    userMessage: string, 
    aiResponse: string, 
    learningData: LearningData,
    language: 'en' | 'bn'
  ): Promise<void> {
    // Create or update knowledge entry
    const existingEntry = this.knowledgeBase.find(entry => 
      entry.keywords.some(keyword => learningData.keywords.includes(keyword)) &&
      (entry.language === language || entry.language === 'both')
    );

    if (existingEntry) {
      // Update existing knowledge
      existingEntry.keywords = [...new Set([...existingEntry.keywords, ...learningData.keywords])];
      existingEntry.responses.push(aiResponse);
      existingEntry.frequency++;
      existingEntry.lastUsed = Date.now();
      existingEntry.confidence = Math.min(existingEntry.confidence + 0.1, 1);
    } else {
      // Create new knowledge entry
      const newEntry: KnowledgeEntry = {
        id: this.generateId(),
        keywords: learningData.keywords,
        responses: [aiResponse],
        patterns: [this.extractPattern(userMessage)],
        frequency: 1,
        lastUsed: Date.now(),
        language,
        confidence: 0.5,
        source: 'conversation'
      };
      this.knowledgeBase.push(newEntry);
    }

    // Save updated knowledge base
    await this.saveKnowledgeBase();
  }

  // Web search functionality (when enabled)
  private async searchWeb(query: string, language: 'en' | 'bn'): Promise<string | null> {
    try {
      // Simple web search using a public API or web scraping
      // For demo purposes, using DuckDuckGo Instant Answer API
      const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      
      const response = await fetch(searchUrl);
      const data = await response.json();
      
      if (data.AbstractText) {
        return this.formatWebResponse(data.AbstractText, language);
      }
      
      return null;
    } catch (error) {
      console.error('Web search failed:', error);
      return null;
    }
  }

  // Format web response to match AI style
  private formatWebResponse(webContent: string, language: 'en' | 'bn'): string {
    const prefix = language === 'en' 
      ? "Based on what I found online: "
      : "অনলাইনে যা পেয়েছি তার ভিত্তিতে: ";
    
    return prefix + webContent.substring(0, 200) + (webContent.length > 200 ? '...' : '');
  }

  // Generate pattern-based response
  private generatePatternResponse(userMessage: string, language: 'en' | 'bn'): string {
    const message = userMessage.toLowerCase();
    
    // Question patterns
    if (message.includes('?') || message.startsWith('what') || message.startsWith('how') || 
        message.startsWith('কি') || message.startsWith('কেন') || message.startsWith('কিভাবে')) {
      return language === 'en' 
        ? "That's a great question! I'm learning more about this topic. Can you share what you already know?"
        : "এটি একটি দুর্দান্ত প্রশ্ন! আমি এই বিষয়ে আরও শিখছি। আপনি কি জানেন তা শেয়ার করতে পারেন?";
    }

    // Greeting patterns
    if (message.includes('hello') || message.includes('hi') || message.includes('hey') ||
        message.includes('হ্যালো') || message.includes('নমস্কার') || message.includes('সালাম')) {
      return language === 'en'
        ? "Hello! I'm your AI assistant. I learn from every conversation we have. How can I help you today?"
        : "হ্যালো! আমি আপনার AI সহায়ক। আমি আমাদের প্রতিটি কথোপকথন থেকে শিখি। আজ আমি আপনাকে কিভাবে সাহায্য করতে পারি?";
    }

    // Thank you patterns
    if (message.includes('thank') || message.includes('thanks') || 
        message.includes('ধন্যবাদ') || message.includes('শুকরিয়া')) {
      return language === 'en'
        ? "You're welcome! I'm always learning and improving. Feel free to teach me more!"
        : "আপনাকে স্বাগতম! আমি সবসময় শিখছি এবং উন্নতি করছি। নির্দ্বিধায় আমাকে আরও শেখান!";
    }

    return this.getRandomDefaultResponse(language);
  }

  // Get random default response
  private getRandomDefaultResponse(language: 'en' | 'bn'): string {
    const responses = this.defaultResponses[language];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  // Generate suggested actions
  private generateSuggestedActions(userMessage: string, language: 'en' | 'bn'): string[] {
    const suggestions = [];
    
    if (language === 'en') {
      suggestions.push('Ask me to explain more about this topic');
      suggestions.push('Share related information to help me learn');
      suggestions.push('Export your conversation history');
    } else {
      suggestions.push('এই বিষয়ে আরও ব্যাখ্যা করতে বলুন');
      suggestions.push('আমাকে শিখতে সাহায্য করার জন্য সম্পর্কিত তথ্য শেয়ার করুন');
      suggestions.push('আপনার কথোপকথনের ইতিহাস রপ্তানি করুন');
    }
    
    return suggestions;
  }

  // Utility methods
  private getRecentContext(): string[] {
    return this.conversationHistory
      .slice(-5)
      .map(msg => msg.content)
      .filter(content => content.length < 100);
  }

  private identifyResponsePattern(text: string, language: 'en' | 'bn'): string {
    if (text.includes('?')) return 'question';
    if (text.includes('!')) return 'exclamation';
    if (text.length < 20) return 'short';
    return 'statement';
  }

  private extractPattern(text: string): string {
    return text.toLowerCase()
      .replace(/[^\w\s\u0980-\u09FF]/g, '')
      .split(/\s+/)
      .slice(0, 5)
      .join(' ');
  }

  private adaptResponse(response: string, userMessage: string, language: 'en' | 'bn'): string {
    // Simple response adaptation based on user's tone
    if (userMessage.includes('!')) {
      return response + (language === 'en' ? '!' : '!');
    }
    if (userMessage.includes('?')) {
      return response + (language === 'en' ? ' What do you think?' : ' আপনি কি মনে করেন?');
    }
    return response;
  }

  private shouldUseWebSearch(message: string): boolean {
    const webTriggers = [
      'what is', 'who is', 'when did', 'how to', 'define', 'explain',
      'কি', 'কে', 'কখন', 'কিভাবে', 'ব্যাখ্যা', 'সংজ্ঞা'
    ];
    return webTriggers.some(trigger => message.toLowerCase().includes(trigger));
  }

  private generateId(): string {
    return `kb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async saveKnowledgeBase(): Promise<void> {
    const kb = await permanentStorage.loadKnowledgeBase();
    if (kb) {
      kb.knowledge = this.knowledgeBase;
      kb.lastUpdated = Date.now();
      kb.stats.knowledgeEntries = this.knowledgeBase.length;
      await permanentStorage.saveKnowledgeBase(kb);
    }
  }
}

export const aiEngine = new AIEngine();