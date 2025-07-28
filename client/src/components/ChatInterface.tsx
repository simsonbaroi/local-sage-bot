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
    console.log('ChatInterface: Initializing chat...');
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
        console.log('ChatInterface: Welcome message added');
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
      // Generate AI response
      const aiResponse: AIResponse = await aiEngine.generateResponse(userMessage.content, currentLanguage);
      
      // Create AI message
      const aiMessage: Message = {
        id: `ai_${Date.now()}`,
        content: aiResponse.content,
        sender: 'ai',
        timestamp: Date.now(),
        language: aiResponse.language,
        confidence: aiResponse.confidence
      };

      // Update messages
      setMessages(prev => [...prev, aiMessage]);
      setIsTyping(false);
      setIsLearning(false);
      
      // Save messages
      await permanentStorage.saveMessage(userMessage);
      await permanentStorage.saveMessage(aiMessage);
      
      // Learn from conversation
      await aiEngine.learnFromConversation(userMessage.content, aiResponse.content);
      
      // Update stats
      setKnowledgeStats(prev => ({
        entries: prev.entries + 1,
        conversations: prev.conversations + 1
      }));

      // Show learning indicator
      toast({
        title: "🧠 Learning!",
        description: currentLanguage === 'bn' 
          ? "আমি এই কথোপকথন থেকে নতুন কিছু শিখলাম!"
          : "I learned something new from this conversation!",
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const exportData = async () => {
    try {
      const data = await permanentStorage.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-assistant-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Export Successful",
        description: "Your conversation data has been exported.",
      });
    } catch (error) {
      toast({
        title: "Export Failed", 
        description: "Failed to export data. Please try again.",
        variant: "destructive"
      });
    }
  };

  const importData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const success = await permanentStorage.importData(text);
      
      if (success) {
        await initializeChat();
        toast({
          title: "Import Successful",
          description: "Your conversation data has been imported.",
        });
      } else {
        throw new Error('Invalid file format');
      }
    } catch (error) {
      toast({
        title: "Import Failed",
        description: "Failed to import data. Please check the file format.",
        variant: "destructive"
      });
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800", className)}>
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <Brain className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-semibold text-foreground">
                AI Assistant
              </h1>
            </div>
            {isLearning && (
              <Badge variant="secondary" className="animate-pulse">
                <Zap className="h-3 w-3 mr-1" />
                Learning...
              </Badge>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <Badge variant="outline">
              <Globe className="h-3 w-3 mr-1" />
              {currentLanguage === 'auto' ? 'Auto' : currentLanguage.toUpperCase()}
            </Badge>
            <Badge variant="outline">
              {knowledgeStats.entries} learned
            </Badge>
            
            <Button variant="ghost" size="sm" onClick={exportData}>
              <Download className="h-4 w-4" />
            </Button>
            
            <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
            </Button>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={importData}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex w-full",
              message.sender === 'user' ? "justify-end" : "justify-start"
            )}
          >
            <Card
              className={cn(
                "max-w-[80%] p-4 shadow-lg border-0",
                message.sender === 'user'
                  ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white"
                  : "bg-gradient-to-r from-purple-500 to-purple-600 text-white"
              )}
            >
              <div className="text-sm font-medium mb-1">
                {message.sender === 'user' ? 'You' : 'AI Assistant'}
                {message.confidence && (
                  <span className="ml-2 text-xs opacity-75">
                    {Math.round(message.confidence * 100)}% confident
                  </span>
                )}
              </div>
              <div className="text-sm leading-relaxed">
                {message.content}
              </div>
              <div className="text-xs opacity-75 mt-2">
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </Card>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex justify-start">
            <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white border-0 p-4 max-w-[80%]">
              <div className="flex items-center space-x-2">
                <div className="animate-bounce">●</div>
                <div className="animate-bounce delay-100">●</div>
                <div className="animate-bounce delay-200">●</div>
                <span className="ml-2 text-sm">AI is thinking...</span>
              </div>
            </Card>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 p-4 border-t bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm">
        <div className="flex items-center space-x-2">
          <Input
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={
              currentLanguage === 'bn' 
                ? "একটি বার্তা টাইপ করুন..." 
                : "Type a message..."
            }
            disabled={isTyping}
            className="flex-1"
          />
          <Button 
            onClick={sendMessage} 
            disabled={isTyping || !inputMessage.trim()}
            className="px-4"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};