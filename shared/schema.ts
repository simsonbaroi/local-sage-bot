import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name"),
  avatar: text("avatar"),
  role: text("role").notNull().default("user"),
  isActive: boolean("is_active").notNull().default(true),
  preferences: jsonb("preferences").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Chat rooms table
export const chatRooms = pgTable("chat_rooms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isPrivate: boolean("is_private").notNull().default(false),
  ownerId: integer("owner_id").references(() => users.id),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Messages table
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").references(() => chatRooms.id),
  userId: integer("user_id").references(() => users.id),
  content: text("content").notNull(),
  messageType: text("message_type").notNull().default("text"), // text, image, file, system
  metadata: jsonb("metadata").default({}),
  isEdited: boolean("is_edited").notNull().default(false),
  isDeleted: boolean("is_deleted").notNull().default(false),
  parentId: integer("parent_id").references(() => messages.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// AI conversations table
export const aiConversations = pgTable("ai_conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  title: text("title"),
  summary: text("summary"),
  language: text("language").notNull().default("en"),
  model: text("model").notNull().default("gpt-3.5-turbo"),
  systemPrompt: text("system_prompt"),
  settings: jsonb("settings").default({}),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// AI messages table
export const aiMessages = pgTable("ai_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => aiConversations.id),
  role: text("role").notNull(), // user, assistant, system
  content: text("content").notNull(),
  metadata: jsonb("metadata").default({}),
  tokens: integer("tokens"),
  cost: text("cost"), // stored as string to handle decimal precision
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Knowledge base table
export const knowledgeBase = pgTable("knowledge_base", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  tags: text("tags").array(),
  category: text("category"),
  embedding: text("embedding"), // JSON string of vector embedding
  isPublic: boolean("is_public").notNull().default(false),
  language: text("language").notNull().default("en"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Files table
export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  path: text("path").notNull(),
  hash: text("hash").notNull(),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Sessions table
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  data: jsonb("data").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Analytics table
export const analytics = pgTable("analytics", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  event: text("event").notNull(),
  data: jsonb("data").default({}),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Authentication tokens table
export const authTokens = pgTable("auth_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  token: text("token").notNull().unique(),
  type: text("type").notNull(), // 'email_verification', 'password_reset', '2fa', 'api_key'
  expiresAt: timestamp("expires_at").notNull(),
  isUsed: boolean("is_used").notNull().default(false),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Two-factor authentication table
export const twoFactorAuth = pgTable("two_factor_auth", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes").array(),
  isEnabled: boolean("is_enabled").notNull().default(false),
  lastUsed: timestamp("last_used"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Email templates table
export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  subject: text("subject").notNull(),
  htmlContent: text("html_content").notNull(),
  textContent: text("text_content").notNull(),
  variables: text("variables").array(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Email queue table
export const emailQueue = pgTable("email_queue", {
  id: serial("id").primaryKey(),
  to: text("to").notNull(),
  from: text("from").notNull(),
  subject: text("subject").notNull(),
  htmlContent: text("html_content"),
  textContent: text("text_content"),
  templateId: integer("template_id").references(() => emailTemplates.id),
  templateData: jsonb("template_data").default({}),
  status: text("status").notNull().default("pending"), // 'pending', 'sent', 'failed', 'retrying'
  attempts: integer("attempts").notNull().default(0),
  lastAttempt: timestamp("last_attempt"),
  error: text("error"),
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// AI learning modules table
export const aiLearningModules = pgTable("ai_learning_modules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  category: text("category").notNull(), // 'language', 'image', 'math', 'history', 'humor', 'coding'
  description: text("description"),
  version: text("version").notNull().default("1.0.0"),
  capabilities: text("capabilities").array(),
  supportedLanguages: text("supported_languages").array(),
  isActive: boolean("is_active").notNull().default(true),
  configuration: jsonb("configuration").default({}),
  performance: jsonb("performance").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// AI training data table
export const aiTrainingData = pgTable("ai_training_data", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").references(() => aiLearningModules.id),
  userId: integer("user_id").references(() => users.id),
  dataType: text("data_type").notNull(), // 'text', 'image', 'code', 'math', 'conversation'
  input: text("input").notNull(),
  expectedOutput: text("expected_output"),
  actualOutput: text("actual_output"),
  feedback: text("feedback"), // 'positive', 'negative', 'neutral'
  confidence: integer("confidence"), // 1-100
  language: text("language").default("en"),
  tags: text("tags").array(),
  metadata: jsonb("metadata").default({}),
  isPublic: boolean("is_public").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Code execution history table
export const codeExecutions = pgTable("code_executions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  conversationId: integer("conversation_id").references(() => aiConversations.id),
  language: text("language").notNull(), // 'python', 'javascript', 'java', 'html', 'css', 'react'
  sourceCode: text("source_code").notNull(),
  input: text("input"),
  output: text("output"),
  error: text("error"),
  executionTime: integer("execution_time"), // milliseconds
  memoryUsage: integer("memory_usage"), // bytes
  status: text("status").notNull(), // 'success', 'error', 'timeout', 'cancelled'
  sandbox: text("sandbox"), // sandbox environment used
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Image analysis table
export const imageAnalysis = pgTable("image_analysis", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  fileId: integer("file_id").references(() => files.id),
  conversationId: integer("conversation_id").references(() => aiConversations.id),
  analysisType: text("analysis_type").notNull(), // 'object_detection', 'ocr', 'description', 'classification'
  results: jsonb("results").notNull(),
  confidence: integer("confidence"), // 1-100
  processingTime: integer("processing_time"), // milliseconds
  modelUsed: text("model_used"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// User skills tracking table
export const userSkills = pgTable("user_skills", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  skillName: text("skill_name").notNull(), // 'python', 'javascript', 'math', 'history', etc.
  proficiencyLevel: integer("proficiency_level").notNull().default(1), // 1-10
  experience: integer("experience").notNull().default(0), // points earned
  lastPracticed: timestamp("last_practiced"),
  achievements: text("achievements").array(),
  strengths: text("strengths").array(),
  weaknesses: text("weaknesses").array(),
  recommendations: text("recommendations").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Humor database table
export const humorDatabase = pgTable("humor_database", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(), // 'programming', 'tech', 'general', 'dark', 'pun', 'dad_joke'
  type: text("type").notNull(), // 'joke', 'pun', 'riddle', 'meme_text', 'witty_response'
  content: text("content").notNull(),
  setup: text("setup"), // for jokes that need setup
  punchline: text("punchline"), // for jokes with punchlines
  tags: text("tags").array(),
  rating: integer("rating").default(5), // 1-10
  language: text("language").default("en"),
  isApproved: boolean("is_approved").notNull().default(false),
  submittedBy: integer("submitted_by").references(() => users.id),
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Learning paths table
export const learningPaths = pgTable("learning_paths", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  pathName: text("path_name").notNull(),
  description: text("description"),
  skills: text("skills").array(),
  currentStep: integer("current_step").notNull().default(0),
  totalSteps: integer("total_steps").notNull(),
  progress: integer("progress").notNull().default(0), // percentage
  difficulty: text("difficulty").notNull().default("beginner"), // 'beginner', 'intermediate', 'advanced'
  estimatedTime: integer("estimated_time"), // minutes
  isCompleted: boolean("is_completed").notNull().default(false),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Zod schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectUserSchema = createSelectSchema(users);

export const insertChatRoomSchema = createInsertSchema(chatRooms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAiConversationSchema = createInsertSchema(aiConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAiMessageSchema = createInsertSchema(aiMessages).omit({
  id: true,
  createdAt: true,
});

export const insertKnowledgeBaseSchema = createInsertSchema(knowledgeBase).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFileSchema = createInsertSchema(files).omit({
  id: true,
  createdAt: true,
});

export const insertAuthTokenSchema = createInsertSchema(authTokens).omit({
  id: true,
  createdAt: true,
});

export const insertTwoFactorAuthSchema = createInsertSchema(twoFactorAuth).omit({
  id: true,
  createdAt: true,
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEmailQueueSchema = createInsertSchema(emailQueue).omit({
  id: true,
  createdAt: true,
});

export const insertAiLearningModuleSchema = createInsertSchema(aiLearningModules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAiTrainingDataSchema = createInsertSchema(aiTrainingData).omit({
  id: true,
  createdAt: true,
});

export const insertCodeExecutionSchema = createInsertSchema(codeExecutions).omit({
  id: true,
  createdAt: true,
});

export const insertImageAnalysisSchema = createInsertSchema(imageAnalysis).omit({
  id: true,
  createdAt: true,
});

export const insertUserSkillsSchema = createInsertSchema(userSkills).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertHumorDatabaseSchema = createInsertSchema(humorDatabase).omit({
  id: true,
  createdAt: true,
});

export const insertLearningPathSchema = createInsertSchema(learningPaths).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type ChatRoom = typeof chatRooms.$inferSelect;
export type InsertChatRoom = z.infer<typeof insertChatRoomSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type AiConversation = typeof aiConversations.$inferSelect;
export type InsertAiConversation = z.infer<typeof insertAiConversationSchema>;
export type AiMessage = typeof aiMessages.$inferSelect;
export type InsertAiMessage = z.infer<typeof insertAiMessageSchema>;
export type KnowledgeBase = typeof knowledgeBase.$inferSelect;
export type InsertKnowledgeBase = z.infer<typeof insertKnowledgeBaseSchema>;
export type FileRecord = typeof files.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;
export type Session = typeof sessions.$inferSelect;
export type Analytics = typeof analytics.$inferSelect;
export type AuthToken = typeof authTokens.$inferSelect;
export type InsertAuthToken = z.infer<typeof insertAuthTokenSchema>;
export type TwoFactorAuth = typeof twoFactorAuth.$inferSelect;
export type InsertTwoFactorAuth = z.infer<typeof insertTwoFactorAuthSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type EmailQueue = typeof emailQueue.$inferSelect;
export type InsertEmailQueue = z.infer<typeof insertEmailQueueSchema>;
export type AiLearningModule = typeof aiLearningModules.$inferSelect;
export type InsertAiLearningModule = z.infer<typeof insertAiLearningModuleSchema>;
export type AiTrainingData = typeof aiTrainingData.$inferSelect;
export type InsertAiTrainingData = z.infer<typeof insertAiTrainingDataSchema>;
export type CodeExecution = typeof codeExecutions.$inferSelect;
export type InsertCodeExecution = z.infer<typeof insertCodeExecutionSchema>;
export type ImageAnalysis = typeof imageAnalysis.$inferSelect;
export type InsertImageAnalysis = z.infer<typeof insertImageAnalysisSchema>;
export type UserSkills = typeof userSkills.$inferSelect;
export type InsertUserSkills = z.infer<typeof insertUserSkillsSchema>;
export type HumorDatabase = typeof humorDatabase.$inferSelect;
export type InsertHumorDatabase = z.infer<typeof insertHumorDatabaseSchema>;
export type LearningPath = typeof learningPaths.$inferSelect;
export type InsertLearningPath = z.infer<typeof insertLearningPathSchema>;

// Additional types for the frontend
export interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: number;
  language?: string;
  confidence?: number;
  metadata?: any;
  messageType?: 'text' | 'image' | 'file' | 'system';
  isEdited?: boolean;
  parentId?: string;
}

export interface AIResponse {
  content: string;
  confidence: number;
  language: string;
  metadata?: any;
  tokens?: number;
  cost?: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: 'en' | 'bn' | 'auto';
  aiModel: string;
  responseStyle: 'formal' | 'casual' | 'technical';
  enableNotifications: boolean;
  autoSave: boolean;
  showTimestamps: boolean;
}

export interface ConversationSummary {
  id: number;
  title: string;
  summary?: string;
  messageCount: number;
  lastMessage: string;
  updatedAt: string;
}