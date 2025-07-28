/**
 * NeuroCore AI Email Service
 * 
 * Self-hosted email system with:
 * - SMTP configuration
 * - Template-based emails
 * - Queue management
 * - Delivery tracking
 * - Retry mechanisms
 * - HTML and text email support
 */

import nodemailer from 'nodemailer';
import { db } from '../db';
import { emailTemplates, emailQueue } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { EmailTemplate, InsertEmailQueue } from '@shared/schema';

export interface EmailConfig {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  from: {
    name: string;
    address: string;
  };
  retry: {
    maxAttempts: number;
    delay: number;
  };
  queue: {
    processInterval: number;
    batchSize: number;
  };
}

export interface EmailData {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  templateId?: number;
  templateData?: Record<string, any>;
}

export class EmailService {
  private config: EmailConfig;
  private transporter: nodemailer.Transporter;
  private isProcessing = false;

  constructor(config: Partial<EmailConfig> = {}) {
    this.config = {
      smtp: {
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || ''
        }
      },
      from: {
        name: process.env.EMAIL_FROM_NAME || 'NeuroCore AI',
        address: process.env.EMAIL_FROM_ADDRESS || 'noreply@neurocore.ai'
      },
      retry: {
        maxAttempts: 3,
        delay: 5 * 60 * 1000 // 5 minutes
      },
      queue: {
        processInterval: 30 * 1000, // 30 seconds
        batchSize: 10
      },
      ...config
    };

    this.createTransporter();
    this.startQueueProcessor();
    this.seedEmailTemplates();
  }

  private createTransporter() {
    this.transporter = nodemailer.createTransporter({
      host: this.config.smtp.host,
      port: this.config.smtp.port,
      secure: this.config.smtp.secure,
      auth: {
        user: this.config.smtp.auth.user,
        pass: this.config.smtp.auth.pass
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // Verify connection configuration
    this.transporter.verify((error, success) => {
      if (error) {
        console.error('❌ SMTP configuration error:', error);
      } else {
        console.log('✅ Email service ready');
      }
    });
  }

  // Send verification email
  async sendVerificationEmail(to: string, name: string, token: string): Promise<boolean> {
    return this.sendTemplateEmail('email_verification', to, {
      name,
      verificationUrl: `${process.env.APP_URL || 'http://localhost:5000'}/auth/verify?token=${token}`,
      token
    });
  }

  // Send password reset email
  async sendPasswordResetEmail(to: string, name: string, token: string): Promise<boolean> {
    return this.sendTemplateEmail('password_reset', to, {
      name,
      resetUrl: `${process.env.APP_URL || 'http://localhost:5000'}/auth/reset?token=${token}`,
      token,
      expiresIn: '1 hour'
    });
  }

  // Send welcome email
  async sendWelcomeEmail(to: string, name: string): Promise<boolean> {
    return this.sendTemplateEmail('welcome', to, {
      name,
      dashboardUrl: `${process.env.APP_URL || 'http://localhost:5000'}/dashboard`,
      supportEmail: this.config.from.address
    });
  }

  // Send template-based email
  async sendTemplateEmail(templateName: string, to: string, data: Record<string, any>): Promise<boolean> {
    try {
      const template = await db.query.emailTemplates.findFirst({
        where: and(
          eq(emailTemplates.name, templateName),
          eq(emailTemplates.isActive, true)
        )
      });

      if (!template) {
        console.error(`Email template '${templateName}' not found`);
        return false;
      }

      const subject = this.processTemplate(template.subject, data);
      const html = this.processTemplate(template.htmlContent, data);
      const text = this.processTemplate(template.textContent, data);

      return this.queueEmail({
        to,
        subject,
        html,
        text,
        templateId: template.id,
        templateData: data
      });
    } catch (error) {
      console.error('Error sending template email:', error);
      return false;
    }
  }

  // Queue email for delivery
  async queueEmail(emailData: EmailData): Promise<boolean> {
    try {
      await db.insert(emailQueue).values({
        to: emailData.to,
        from: `${this.config.from.name} <${this.config.from.address}>`,
        subject: emailData.subject,
        htmlContent: emailData.html,
        textContent: emailData.text,
        templateId: emailData.templateId,
        templateData: emailData.templateData || {},
        status: 'pending',
        attempts: 0,
        scheduledAt: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error queueing email:', error);
      return false;
    }
  }

  // Process template variables
  private processTemplate(template: string, data: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] !== undefined ? String(data[key]) : match;
    });
  }

  // Start queue processor
  private startQueueProcessor() {
    setInterval(async () => {
      if (!this.isProcessing) {
        await this.processEmailQueue();
      }
    }, this.config.queue.processInterval);
  }

  // Process email queue
  private async processEmailQueue() {
    this.isProcessing = true;

    try {
      // Get pending emails
      const pendingEmails = await db.query.emailQueue.findMany({
        where: eq(emailQueue.status, 'pending'),
        limit: this.config.queue.batchSize
      });

      for (const email of pendingEmails) {
        await this.processEmail(email);
      }

      // Retry failed emails
      const retryEmails = await db.query.emailQueue.findMany({
        where: and(
          eq(emailQueue.status, 'failed'),
          // Only retry if we haven't exceeded max attempts
        ),
        limit: this.config.queue.batchSize
      });

      for (const email of retryEmails) {
        if (email.attempts < this.config.retry.maxAttempts) {
          // Check if enough time has passed since last attempt
          const timeSinceLastAttempt = email.lastAttempt 
            ? Date.now() - new Date(email.lastAttempt).getTime()
            : Infinity;

          if (timeSinceLastAttempt >= this.config.retry.delay) {
            await this.processEmail(email);
          }
        }
      }
    } catch (error) {
      console.error('Error processing email queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  // Process individual email
  private async processEmail(email: any) {
    try {
      // Update status to sending
      await db.update(emailQueue)
        .set({ status: 'sending' })
        .where(eq(emailQueue.id, email.id));

      // Send email
      const info = await this.transporter.sendMail({
        from: email.from,
        to: email.to,
        subject: email.subject,
        html: email.htmlContent,
        text: email.textContent
      });

      // Update status to sent
      await db.update(emailQueue)
        .set({
          status: 'sent',
          sentAt: new Date()
        })
        .where(eq(emailQueue.id, email.id));

      console.log(`✅ Email sent to ${email.to}: ${info.messageId}`);
    } catch (error) {
      console.error(`❌ Failed to send email to ${email.to}:`, error);

      // Update status to failed
      await db.update(emailQueue)
        .set({
          status: 'failed',
          attempts: email.attempts + 1,
          lastAttempt: new Date(),
          error: error instanceof Error ? error.message : String(error)
        })
        .where(eq(emailQueue.id, email.id));
    }
  }

  // Seed default email templates
  private async seedEmailTemplates() {
    const templates = [
      {
        name: 'email_verification',
        subject: 'Verify Your NeuroCore AI Account',
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #2563eb;">Welcome to NeuroCore AI!</h1>
            <p>Hi {{name}},</p>
            <p>Thank you for creating your NeuroCore AI account. To get started, please verify your email address by clicking the button below:</p>
            <a href="{{verificationUrl}}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">Verify Email Address</a>
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #6b7280;">{{verificationUrl}}</p>
            <p>This verification link will expire in 24 hours.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px;">If you didn't create this account, you can safely ignore this email.</p>
          </div>
        `,
        textContent: `
          Welcome to NeuroCore AI!
          
          Hi {{name}},
          
          Thank you for creating your NeuroCore AI account. To get started, please verify your email address by visiting this link:
          
          {{verificationUrl}}
          
          This verification link will expire in 24 hours.
          
          If you didn't create this account, you can safely ignore this email.
        `,
        variables: ['name', 'verificationUrl', 'token']
      },
      {
        name: 'password_reset',
        subject: 'Reset Your NeuroCore AI Password',
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #dc2626;">Password Reset Request</h1>
            <p>Hi {{name}},</p>
            <p>We received a request to reset your NeuroCore AI password. Click the button below to create a new password:</p>
            <a href="{{resetUrl}}" style="display: inline-block; background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">Reset Password</a>
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #6b7280;">{{resetUrl}}</p>
            <p><strong>This link will expire in {{expiresIn}}.</strong></p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px;">If you didn't request this password reset, you can safely ignore this email. Your password will not be changed.</p>
          </div>
        `,
        textContent: `
          Password Reset Request
          
          Hi {{name}},
          
          We received a request to reset your NeuroCore AI password. Visit this link to create a new password:
          
          {{resetUrl}}
          
          This link will expire in {{expiresIn}}.
          
          If you didn't request this password reset, you can safely ignore this email. Your password will not be changed.
        `,
        variables: ['name', 'resetUrl', 'token', 'expiresIn']
      },
      {
        name: 'welcome',
        subject: 'Welcome to NeuroCore AI - Your AI Journey Begins!',
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #059669;">Welcome to NeuroCore AI!</h1>
            <p>Hi {{name}},</p>
            <p>Your account has been successfully verified and you're now part of the NeuroCore AI community!</p>
            
            <h2 style="color: #374151;">What you can do with NeuroCore AI:</h2>
            <ul style="color: #4b5563;">
              <li><strong>🧠 Intelligent Conversations:</strong> Chat with our advanced AI across multiple languages</li>
              <li><strong>🖼️ Image Analysis:</strong> Upload and analyze images with AI-powered insights</li>
              <li><strong>💻 Code Assistance:</strong> Get help with Python, JavaScript, React, and more</li>
              <li><strong>📚 Knowledge Learning:</strong> Build and share your personal knowledge base</li>
              <li><strong>🎯 Math & History:</strong> Solve complex problems and explore historical topics</li>
              <li><strong>😄 AI with Humor:</strong> Enjoy conversations with personality and wit</li>
            </ul>
            
            <a href="{{dashboardUrl}}" style="display: inline-block; background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">Start Your AI Journey</a>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px;">
              Need help? Contact us at {{supportEmail}} or visit our documentation.
            </p>
          </div>
        `,
        textContent: `
          Welcome to NeuroCore AI!
          
          Hi {{name}},
          
          Your account has been successfully verified and you're now part of the NeuroCore AI community!
          
          What you can do with NeuroCore AI:
          • Intelligent Conversations: Chat with our advanced AI across multiple languages
          • Image Analysis: Upload and analyze images with AI-powered insights  
          • Code Assistance: Get help with Python, JavaScript, React, and more
          • Knowledge Learning: Build and share your personal knowledge base
          • Math & History: Solve complex problems and explore historical topics
          • AI with Humor: Enjoy conversations with personality and wit
          
          Get started: {{dashboardUrl}}
          
          Need help? Contact us at {{supportEmail}} or visit our documentation.
        `,
        variables: ['name', 'dashboardUrl', 'supportEmail']
      }
    ];

    for (const template of templates) {
      try {
        // Check if template already exists
        const existing = await db.query.emailTemplates.findFirst({
          where: eq(emailTemplates.name, template.name)
        });

        if (!existing) {
          await db.insert(emailTemplates).values(template);
          console.log(`✅ Email template '${template.name}' created`);
        }
      } catch (error) {
        console.error(`Error creating email template '${template.name}':`, error);
      }
    }
  }

  // Utility methods
  async getQueueStats() {
    const pending = await db.query.emailQueue.findMany({
      where: eq(emailQueue.status, 'pending')
    });

    const failed = await db.query.emailQueue.findMany({
      where: eq(emailQueue.status, 'failed')
    });

    const sent = await db.query.emailQueue.findMany({
      where: eq(emailQueue.status, 'sent')
    });

    return {
      pending: pending.length,
      failed: failed.length,
      sent: sent.length,
      processing: this.isProcessing
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Email service connection test failed:', error);
      return false;
    }
  }
}