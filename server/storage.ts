import { db } from './db';
import { neuroCore } from './core/NeuroCore';
import type { 
  User, 
  InsertUser, 
  AiConversation, 
  InsertAiConversation,
  AiMessage,
  InsertAiMessage,
  KnowledgeBase,
  InsertKnowledgeBase,
  FileRecord,
  InsertFile,
  ChatRoom,
  InsertChatRoom,
  Message,
  InsertMessage
} from "@shared/schema";

export interface IStorage {
  // User management
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User>;
  deleteUser(id: number): Promise<boolean>;
  
  // AI Conversations
  createConversation(conversation: InsertAiConversation): Promise<AiConversation>;
  getConversation(id: number, userId: number): Promise<AiConversation | undefined>;
  getUserConversations(userId: number, limit?: number): Promise<AiConversation[]>;
  updateConversation(id: number, updates: Partial<AiConversation>): Promise<AiConversation>;
  deleteConversation(id: number, userId: number): Promise<boolean>;
  
  // AI Messages
  addMessage(message: InsertAiMessage): Promise<AiMessage>;
  getMessages(conversationId: number, limit?: number): Promise<AiMessage[]>;
  
  // Knowledge Base
  addKnowledge(knowledge: InsertKnowledgeBase): Promise<KnowledgeBase>;
  getKnowledge(id: number, userId: number): Promise<KnowledgeBase | undefined>;
  searchKnowledge(query: string, userId: number, isPublic?: boolean): Promise<KnowledgeBase[]>;
  updateKnowledge(id: number, updates: Partial<KnowledgeBase>): Promise<KnowledgeBase>;
  deleteKnowledge(id: number, userId: number): Promise<boolean>;
  
  // File management
  saveFile(file: InsertFile): Promise<FileRecord>;
  getFile(id: number, userId: number): Promise<FileRecord | undefined>;
  getUserFiles(userId: number): Promise<FileRecord[]>;
  deleteFile(id: number, userId: number): Promise<boolean>;
  
  // Chat Rooms
  createChatRoom(room: InsertChatRoom): Promise<ChatRoom>;
  getChatRoom(id: number): Promise<ChatRoom | undefined>;
  getUserChatRooms(userId: number): Promise<ChatRoom[]>;
  
  // Chat Messages
  addChatMessage(message: InsertMessage): Promise<Message>;
  getChatMessages(roomId: number, limit?: number): Promise<Message[]>;
  
  // Analytics and Stats
  getSystemStats(): Promise<any>;
  getUserStats(userId: number): Promise<any>;
}

export class NeuroCoreStorage implements IStorage {
  
  // User Management
  async getUser(id: number): Promise<User | undefined> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, id)
    });
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const user = database.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
    if (user && typeof user.preferences === 'string') {
      user.preferences = JSON.parse(user.preferences);
    }
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const user = database.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;
    if (user && typeof user.preferences === 'string') {
      user.preferences = JSON.parse(user.preferences);
    }
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const now = new Date().toISOString();
    const result = database.prepare(`
      INSERT INTO users (username, email, password, display_name, avatar, role, is_active, preferences, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      insertUser.username,
      insertUser.email,
      insertUser.password,
      insertUser.displayName || insertUser.username,
      insertUser.avatar || null,
      insertUser.role || 'user',
      insertUser.isActive !== false ? 1 : 0,
      JSON.stringify(insertUser.preferences || {}),
      now,
      now
    );

    const user = await this.getUser(result.lastInsertRowid as number);
    if (!user) throw new Error('Failed to create user');
    
    neuroCore.trackEvent(user.id, 'user_created');
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const setClause = [];
    const values = [];
    
    if (updates.username) {
      setClause.push('username = ?');
      values.push(updates.username);
    }
    if (updates.email) {
      setClause.push('email = ?');
      values.push(updates.email);
    }
    if (updates.displayName) {
      setClause.push('display_name = ?');
      values.push(updates.displayName);
    }
    if (updates.avatar) {
      setClause.push('avatar = ?');
      values.push(updates.avatar);
    }
    if (updates.preferences) {
      setClause.push('preferences = ?');
      values.push(JSON.stringify(updates.preferences));
    }
    
    setClause.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    database.prepare(`
      UPDATE users SET ${setClause.join(', ')} WHERE id = ?
    `).run(...values);

    const user = await this.getUser(id);
    if (!user) throw new Error('User not found');
    
    neuroCore.trackEvent(id, 'user_updated');
    return user;
  }

  async deleteUser(id: number): Promise<boolean> {
    const result = database.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id);
    neuroCore.trackEvent(id, 'user_deleted');
    return result.changes > 0;
  }

  // AI Conversations
  async createConversation(conversation: InsertAiConversation): Promise<AiConversation> {
    const now = new Date().toISOString();
    const result = database.prepare(`
      INSERT INTO ai_conversations (user_id, title, summary, language, model, system_prompt, settings, is_archived, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      conversation.userId,
      conversation.title || `Conversation ${new Date().toLocaleString()}`,
      conversation.summary || null,
      conversation.language || 'en',
      conversation.model || 'neurocore-v1',
      conversation.systemPrompt || null,
      JSON.stringify(conversation.settings || {}),
      conversation.isArchived ? 1 : 0,
      now,
      now
    );

    const created = database.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(result.lastInsertRowid) as AiConversation;
    if (typeof created.settings === 'string') {
      created.settings = JSON.parse(created.settings);
    }
    
    neuroCore.trackEvent(conversation.userId!, 'conversation_created', { conversationId: created.id });
    return created;
  }

  async getConversation(id: number, userId: number): Promise<AiConversation | undefined> {
    const conversation = database.prepare('SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?').get(id, userId) as AiConversation | undefined;
    if (conversation && typeof conversation.settings === 'string') {
      conversation.settings = JSON.parse(conversation.settings);
    }
    return conversation;
  }

  async getUserConversations(userId: number, limit: number = 50): Promise<AiConversation[]> {
    const conversations = database.prepare(`
      SELECT * FROM ai_conversations 
      WHERE user_id = ? AND is_archived = 0
      ORDER BY updated_at DESC 
      LIMIT ?
    `).all(userId, limit) as AiConversation[];
    
    return conversations.map(conv => {
      if (typeof conv.settings === 'string') {
        conv.settings = JSON.parse(conv.settings);
      }
      return conv;
    });
  }

  async updateConversation(id: number, updates: Partial<AiConversation>): Promise<AiConversation> {
    const setClause = [];
    const values = [];
    
    if (updates.title) {
      setClause.push('title = ?');
      values.push(updates.title);
    }
    if (updates.summary) {
      setClause.push('summary = ?');
      values.push(updates.summary);
    }
    if (updates.settings) {
      setClause.push('settings = ?');
      values.push(JSON.stringify(updates.settings));
    }
    if (updates.isArchived !== undefined) {
      setClause.push('is_archived = ?');
      values.push(updates.isArchived ? 1 : 0);
    }
    
    setClause.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    database.prepare(`
      UPDATE ai_conversations SET ${setClause.join(', ')} WHERE id = ?
    `).run(...values);

    const conversation = database.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(id) as AiConversation;
    if (typeof conversation.settings === 'string') {
      conversation.settings = JSON.parse(conversation.settings);
    }
    
    return conversation;
  }

  async deleteConversation(id: number, userId: number): Promise<boolean> {
    const result = database.prepare('UPDATE ai_conversations SET is_archived = 1 WHERE id = ? AND user_id = ?').run(id, userId);
    neuroCore.trackEvent(userId, 'conversation_deleted', { conversationId: id });
    return result.changes > 0;
  }

  // AI Messages
  async addMessage(message: InsertAiMessage): Promise<AiMessage> {
    const result = database.prepare(`
      INSERT INTO ai_messages (conversation_id, role, content, metadata, tokens, cost, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      message.conversationId,
      message.role,
      message.content,
      JSON.stringify(message.metadata || {}),
      message.tokens || null,
      message.cost || null,
      new Date().toISOString()
    );

    const created = database.prepare('SELECT * FROM ai_messages WHERE id = ?').get(result.lastInsertRowid) as AiMessage;
    if (typeof created.metadata === 'string') {
      created.metadata = JSON.parse(created.metadata);
    }
    
    return created;
  }

  async getMessages(conversationId: number, limit: number = 100): Promise<AiMessage[]> {
    const messages = database.prepare(`
      SELECT * FROM ai_messages 
      WHERE conversation_id = ? 
      ORDER BY created_at ASC 
      LIMIT ?
    `).all(conversationId, limit) as AiMessage[];
    
    return messages.map(msg => {
      if (typeof msg.metadata === 'string') {
        msg.metadata = JSON.parse(msg.metadata);
      }
      return msg;
    });
  }

  // Knowledge Base
  async addKnowledge(knowledge: InsertKnowledgeBase): Promise<KnowledgeBase> {
    const now = new Date().toISOString();
    const result = database.prepare(`
      INSERT INTO knowledge_base (user_id, title, content, tags, category, embedding, is_public, language, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      knowledge.userId,
      knowledge.title,
      knowledge.content,
      knowledge.tags ? JSON.stringify(knowledge.tags) : null,
      knowledge.category || 'general',
      knowledge.embedding || null,
      knowledge.isPublic ? 1 : 0,
      knowledge.language || 'en',
      now,
      now
    );

    const created = database.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(result.lastInsertRowid) as KnowledgeBase;
    if (created.tags && typeof created.tags === 'string') {
      created.tags = JSON.parse(created.tags);
    }
    
    neuroCore.trackEvent(knowledge.userId!, 'knowledge_added', { knowledgeId: created.id });
    return created;
  }

  async getKnowledge(id: number, userId: number): Promise<KnowledgeBase | undefined> {
    const knowledge = database.prepare(`
      SELECT * FROM knowledge_base 
      WHERE id = ? AND (user_id = ? OR is_public = 1)
    `).get(id, userId) as KnowledgeBase | undefined;
    
    if (knowledge && knowledge.tags && typeof knowledge.tags === 'string') {
      knowledge.tags = JSON.parse(knowledge.tags);
    }
    
    return knowledge;
  }

  async searchKnowledge(query: string, userId: number, isPublic: boolean = false): Promise<KnowledgeBase[]> {
    const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
    if (searchTerms.length === 0) return [];

    const whereClause = isPublic 
      ? 'is_public = 1' 
      : '(user_id = ? OR is_public = 1)';
    
    const searchConditions = searchTerms.map(() => '(LOWER(title) LIKE ? OR LOWER(content) LIKE ?)').join(' OR ');
    
    const searchParams = searchTerms.flatMap(term => [`%${term}%`, `%${term}%`]);
    const params = isPublic ? searchParams : [userId, ...searchParams];

    const knowledge = database.prepare(`
      SELECT * FROM knowledge_base 
      WHERE ${whereClause} AND (${searchConditions})
      ORDER BY created_at DESC 
      LIMIT 20
    `).all(...params) as KnowledgeBase[];
    
    return knowledge.map(kb => {
      if (kb.tags && typeof kb.tags === 'string') {
        kb.tags = JSON.parse(kb.tags);
      }
      return kb;
    });
  }

  async updateKnowledge(id: number, updates: Partial<KnowledgeBase>): Promise<KnowledgeBase> {
    const setClause = [];
    const values = [];
    
    if (updates.title) {
      setClause.push('title = ?');
      values.push(updates.title);
    }
    if (updates.content) {
      setClause.push('content = ?');
      values.push(updates.content);
    }
    if (updates.tags) {
      setClause.push('tags = ?');
      values.push(JSON.stringify(updates.tags));
    }
    if (updates.category) {
      setClause.push('category = ?');
      values.push(updates.category);
    }
    if (updates.isPublic !== undefined) {
      setClause.push('is_public = ?');
      values.push(updates.isPublic ? 1 : 0);
    }
    
    setClause.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    database.prepare(`
      UPDATE knowledge_base SET ${setClause.join(', ')} WHERE id = ?
    `).run(...values);

    const knowledge = database.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(id) as KnowledgeBase;
    if (knowledge.tags && typeof knowledge.tags === 'string') {
      knowledge.tags = JSON.parse(knowledge.tags);
    }
    
    return knowledge;
  }

  async deleteKnowledge(id: number, userId: number): Promise<boolean> {
    const result = database.prepare('DELETE FROM knowledge_base WHERE id = ? AND user_id = ?').run(id, userId);
    neuroCore.trackEvent(userId, 'knowledge_deleted', { knowledgeId: id });
    return result.changes > 0;
  }

  // File Management
  async saveFile(file: InsertFile): Promise<FileRecord> {
    const result = database.prepare(`
      INSERT INTO files (user_id, filename, original_name, mime_type, size, path, hash, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      file.userId,
      file.filename,
      file.originalName,
      file.mimeType,
      file.size,
      file.path,
      file.hash,
      JSON.stringify(file.metadata || {}),
      new Date().toISOString()
    );

    const created = database.prepare('SELECT * FROM files WHERE id = ?').get(result.lastInsertRowid) as FileRecord;
    if (typeof created.metadata === 'string') {
      created.metadata = JSON.parse(created.metadata);
    }
    
    neuroCore.trackEvent(file.userId!, 'file_uploaded', { fileId: created.id });
    return created;
  }

  async getFile(id: number, userId: number): Promise<FileRecord | undefined> {
    const file = database.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').get(id, userId) as FileRecord | undefined;
    if (file && typeof file.metadata === 'string') {
      file.metadata = JSON.parse(file.metadata);
    }
    return file;
  }

  async getUserFiles(userId: number): Promise<FileRecord[]> {
    const files = database.prepare(`
      SELECT * FROM files 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `).all(userId) as FileRecord[];
    
    return files.map(file => {
      if (typeof file.metadata === 'string') {
        file.metadata = JSON.parse(file.metadata);
      }
      return file;
    });
  }

  async deleteFile(id: number, userId: number): Promise<boolean> {
    const result = database.prepare('DELETE FROM files WHERE id = ? AND user_id = ?').run(id, userId);
    neuroCore.trackEvent(userId, 'file_deleted', { fileId: id });
    return result.changes > 0;
  }

  // Chat Rooms
  async createChatRoom(room: InsertChatRoom): Promise<ChatRoom> {
    const now = new Date().toISOString();
    const result = database.prepare(`
      INSERT INTO chat_rooms (name, description, is_private, owner_id, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      room.name,
      room.description || null,
      room.isPrivate ? 1 : 0,
      room.ownerId,
      JSON.stringify(room.settings || {}),
      now,
      now
    );

    const created = database.prepare('SELECT * FROM chat_rooms WHERE id = ?').get(result.lastInsertRowid) as ChatRoom;
    if (typeof created.settings === 'string') {
      created.settings = JSON.parse(created.settings);
    }
    
    neuroCore.trackEvent(room.ownerId!, 'chat_room_created', { roomId: created.id });
    return created;
  }

  async getChatRoom(id: number): Promise<ChatRoom | undefined> {
    const room = database.prepare('SELECT * FROM chat_rooms WHERE id = ?').get(id) as ChatRoom | undefined;
    if (room && typeof room.settings === 'string') {
      room.settings = JSON.parse(room.settings);
    }
    return room;
  }

  async getUserChatRooms(userId: number): Promise<ChatRoom[]> {
    const rooms = database.prepare(`
      SELECT * FROM chat_rooms 
      WHERE owner_id = ? OR is_private = 0
      ORDER BY updated_at DESC
    `).all(userId) as ChatRoom[];
    
    return rooms.map(room => {
      if (typeof room.settings === 'string') {
        room.settings = JSON.parse(room.settings);
      }
      return room;
    });
  }

  // Chat Messages
  async addChatMessage(message: InsertMessage): Promise<Message> {
    const now = new Date().toISOString();
    const result = database.prepare(`
      INSERT INTO messages (room_id, user_id, content, message_type, metadata, is_edited, is_deleted, parent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      message.roomId,
      message.userId,
      message.content,
      message.messageType || 'text',
      JSON.stringify(message.metadata || {}),
      message.isEdited ? 1 : 0,
      message.isDeleted ? 1 : 0,
      message.parentId || null,
      now,
      now
    );

    const created = database.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid) as Message;
    if (typeof created.metadata === 'string') {
      created.metadata = JSON.parse(created.metadata);
    }
    
    neuroCore.trackEvent(message.userId!, 'message_sent', { roomId: message.roomId });
    return created;
  }

  async getChatMessages(roomId: number, limit: number = 50): Promise<Message[]> {
    const messages = database.prepare(`
      SELECT m.*, u.username, u.display_name, u.avatar
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.room_id = ? AND m.is_deleted = 0
      ORDER BY m.created_at DESC
      LIMIT ?
    `).all(roomId, limit) as (Message & { username: string; display_name: string; avatar: string })[];
    
    return messages.reverse().map(msg => {
      if (typeof msg.metadata === 'string') {
        msg.metadata = JSON.parse(msg.metadata);
      }
      return msg;
    });
  }

  // Analytics and Stats
  async getSystemStats(): Promise<any> {
    return {
      ...database.getStats(),
      neuroCore: neuroCore.getSystemStats()
    };
  }

  async getUserStats(userId: number): Promise<any> {
    const conversations = database.prepare('SELECT COUNT(*) as count FROM ai_conversations WHERE user_id = ?').get(userId) as { count: number };
    const messages = database.prepare('SELECT COUNT(*) as count FROM ai_messages WHERE conversation_id IN (SELECT id FROM ai_conversations WHERE user_id = ?)').get(userId) as { count: number };
    const knowledge = database.prepare('SELECT COUNT(*) as count FROM knowledge_base WHERE user_id = ?').get(userId) as { count: number };
    const files = database.prepare('SELECT COUNT(*) as count FROM files WHERE user_id = ?').get(userId) as { count: number };
    
    return {
      conversations: conversations.count,
      messages: messages.count,
      knowledge: knowledge.count,
      files: files.count,
      joinedAt: database.prepare('SELECT created_at FROM users WHERE id = ?').get(userId)
    };
  }
}

export const storage = new NeuroCoreStorage();
