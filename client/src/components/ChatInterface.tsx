// Chat Interface - Beautiful, responsive chat UI with real-time learning indicators

import React, { useState, useRef, useEffect } from 'react';
import { Message, AIResponse } from '@/types/ai';
import { aiEngine } from '@/utils/ai-engine';
import { permanentStorage } from '@/utils/storage';
import { cn } from '@/lib/utils';
import { Send, Download, Upload, Brain, Globe, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface ChatInterfaceProps {
  className?: string;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ className }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLearning, setIsLearning] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<'en' | 'bn' | 'auto'>('auto');
  const [knowledgeStats, setKnowledgeStats] = useState({ entries: 0, conversations: 0 });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    initializeChat();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initializeChat = async () => {
    try {
      await aiEngine.initialize();
      const history = await permanentStorage.getConversationHistory(50);
      setMessages(history);
      
      const kb = await permanentStorage.loadKnowledgeBase();
      if (kb) {
        setKnowledgeStats({
          entries: kb.knowledge.length,
          conversations: kb.stats.totalConversations
        });
      }

      // Welcome message
      if (history.length === 0) {
        const welcomeMessage: Message = {
          id: `welcome_${Date.now()}`,
          content: currentLanguage === 'bn' 
            ? "নমস্কার! আমি আপনার AI সহায়ক। আমি প্রতিটি কথোপকথন থেকে শিখি এবং সময়ের সাথে উন্নত হই। আপনি আমাকে যা শেখাবেন তা স্থায়ীভাবে সংরক্ষিত থাকবে। আমাকে কিছু জিজ্ঞাসা করুন!"
            : "Hello! I'm your AI assistant. I learn from every conversation and improve over time. Everything you teach me is permanently stored. Ask me anything!",
          sender: 'ai',
          timestamp: Date.now(),
          language: currentLanguage,
          confidence: 1
        };
        setMessages([welcomeMessage]);
      }
    } catch (error) {
      console.error('Failed to initialize chat:', error);
      toast({
        title: "Initialization Error",
        description: "Failed to load chat history. Starting fresh.",
        variant: "destructive"
      });
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      content: inputMessage.trim(),
      sender: 'user',
      timestamp: Date.now(),
      language: currentLanguage
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsTyping(true);
    setIsLearning(true);

    try {
      // Process message through AI engine
      const aiResponse: AIResponse = await aiEngine.processMessage(userMessage.content);
      
      // Create AI message
      const aiMessage: Message = {
        id: `ai_${Date.now()}`,
        content: aiResponse.content,
        sender: 'ai',
        timestamp: Date.now(),
        language: aiResponse.learningData.keywords.length > 0 ? 
          (aiResponse.learningData.keywords.some(k => /[\u0980-\u09FF]/.test(k)) ? 'bn' : 'en') : 
          currentLanguage,
        confidence: aiResponse.confidence,
        learningData: aiResponse.learningData
      };

      // Simulate typing delay for better UX
      setTimeout(() => {
        setMessages(prev => [...prev, aiMessage]);
        setIsTyping(false);
        setIsLearning(false);
        
        // Update stats
        setKnowledgeStats(prev => ({
          entries: prev.entries + (aiResponse.source === 'knowledge' ? 0 : 1),
          conversations: prev.conversations
        }));

        // Show learning indicator
        if (aiResponse.source !== 'knowledge') {
          toast({
            title: "🧠 Learning!",
            description: currentLanguage === 'bn' 
              ? "আমি এই কথোপকথন থেকে নতুন কিছু শিখলাম!"
              : "I learned something new from this conversation!",
          });
        }
      }, 1000 + Math.random() * 1000);

      // Save conversation
      await permanentStorage.saveKnowledgeBase({
        version: '1.0.0',
        lastUpdated: Date.now(),
        conversations: [...messages, userMessage, aiMessage],
        knowledge: [], // Will be updated by AI engine
        userPreferences: {
          preferredLanguage: currentLanguage,
          responseStyle: 'casual',
          learningMode: true,
          autoExport: true,
          webAccess: true
        },
        stats: {
          totalConversations: 1,
          totalMessages: messages.length + 2,
          knowledgeEntries: knowledgeStats.entries,
          lastBackup: Date.now(),
          learningAccuracy: aiResponse.confidence,
          responseTime: [Date.now() - userMessage.timestamp]
        }
      });

    } catch (error) {
      console.error('Error processing message:', error);
      setIsTyping(false);
      setIsLearning(false);
      
      toast({
        title: "Error",
        description: "Failed to process message. Please try again.",
        variant: "destructive"
      });
    }
  };

  const exportConversation = async () => {
    try {
      const kb = await permanentStorage.loadKnowledgeBase();
      if (kb) {
        await permanentStorage.exportToFile(kb);
        toast({
          title: "✅ Export Complete",
          description: "Your AI's knowledge has been downloaded as a backup file.",
        });
      }
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Could not export conversation data.",
        variant: "destructive"
      });
    }
  };

  const importConversation = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const importedKB = await permanentStorage.importFromFile(file);
      if (importedKB) {
        setMessages(importedKB.conversations);
        setKnowledgeStats({
          entries: importedKB.knowledge.length,
          conversations: importedKB.stats.totalConversations
        });
        
        toast({
          title: "✅ Import Complete",
          description: `Restored ${importedKB.conversations.length} messages and ${importedKB.knowledge.length} knowledge entries.`,
        });
      }
    } catch (error) {
      toast({
        title: "Import Failed",
        description: "Could not import the selected file.",
        variant: "destructive"
      });
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className={cn("flex flex-col h-full max-w-4xl mx-auto", className)}>
      {/* Header with stats */}
      <div className="flex items-center justify-between p-4 border-b bg-gradient-card backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-ai rounded-lg shadow-ai">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-foreground">AI Assistant</h1>
            <p className="text-sm text-muted-foreground">
              Learning • {knowledgeStats.entries} entries • {knowledgeStats.conversations} chats
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Zap className="w-3 h-3" />
            {isLearning ? 'Learning...' : 'Ready'}
          </Badge>
          
          <select
            value={currentLanguage}
            onChange={(e) => setCurrentLanguage(e.target.value as 'en' | 'bn' | 'auto')}
            className="text-sm bg-background border border-border rounded px-2 py-1"
          >
            <option value="auto">Auto</option>
            <option value="en">English</option>
            <option value="bn">বাংলা</option>
          </select>

          <Button variant="ghost" size="sm" onClick={exportConversation}>
            <Download className="w-4 h-4" />
          </Button>
          
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4" />
          </Button>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={importConversation}
            className="hidden"
          />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-bg">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex animate-slide-up",
              message.sender === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            <Card
              className={cn(
                "max-w-[80%] p-4 shadow-card transition-all duration-300 hover:shadow-float",
                message.sender === 'user'
                  ? "bg-gradient-user text-white shadow-user ml-12"
                  : "bg-gradient-ai text-white shadow-ai mr-12"
              )}
            >
              <div className="space-y-2">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </p>
                
                <div className="flex items-center justify-between text-xs text-white/70">
                  <span className="flex items-center gap-1">
                    {message.sender === 'ai' && (
                      <>
                        <Brain className="w-3 h-3" />
                        {message.confidence && (
                          <span>{Math.round(message.confidence * 100)}%</span>
                        )}
                      </>
                    )}
                    {message.language && message.language !== 'auto' && (
                      <Badge variant="secondary" className="text-xs h-5">
                        {message.language === 'bn' ? 'বাংলা' : 'EN'}
                      </Badge>
                    )}
                  </span>
                  
                  <span>
                    {new Date(message.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>

                {message.learningData && message.learningData.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {message.learningData.keywords.slice(0, 3).map((keyword, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs h-5">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start animate-slide-up">
            <Card className="bg-gradient-ai text-white shadow-ai p-4 mr-12">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-white/70 rounded-full animate-thinking" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-white/70 rounded-full animate-thinking" style={{ animationDelay: '200ms' }} />
                  <div className="w-2 h-2 bg-white/70 rounded-full animate-thinking" style={{ animationDelay: '400ms' }} />
                </div>
                <span className="text-sm text-white/70">
                  {isLearning ? 'Learning and thinking...' : 'Thinking...'}
                </span>
              </div>
            </Card>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t bg-background/95 backdrop-blur-sm">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder={currentLanguage === 'bn' 
                ? "আমাকে কিছু জিজ্ঞাসা করুন বা শেখান..."
                : "Ask me anything or teach me something..."
              }
              className="pr-12 py-6 text-base border-2 focus:border-primary transition-all duration-300"
              disabled={isTyping}
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
              {isLearning && (
                <div className="animate-pulse">
                  <Brain className="w-4 h-4 text-ai-learning" />
                </div>
              )}
            </div>
          </div>
          
          <Button
            onClick={sendMessage}
            disabled={!inputMessage.trim() || isTyping}
            className="px-6 py-6 bg-gradient-primary hover:animate-pulse-glow transition-all duration-300"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="mt-2 text-xs text-muted-foreground text-center">
          {currentLanguage === 'bn' 
            ? "আমি প্রতিটি কথোপকথন থেকে শিখি এবং স্থায়ীভাবে মনে রাখি • ওয়েব অনুসন্ধান সক্ষম"
            : "I learn from every conversation and remember permanently • Web search enabled"
          }
        </div>
      </div>
    </div>
  );
};