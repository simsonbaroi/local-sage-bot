/**
 * NeuroCore AI Authentication System
 * 
 * A comprehensive authentication system with:
 * - Secure password hashing
 * - JWT token management
 * - Two-factor authentication (2FA)
 * - Email verification
 * - Password reset functionality
 * - Session management
 * - Rate limiting
 * - Security logging
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { db } from '../db';
import { users, authTokens, twoFactorAuth, sessions } from '@shared/schema';
import { eq, and, gt } from 'drizzle-orm';
import type { User, InsertUser, AuthToken, TwoFactorAuth as TwoFA } from '@shared/schema';

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiration: string;
  bcryptRounds: number;
  tokenExpiration: {
    emailVerification: number;
    passwordReset: number;
    twoFactor: number;
  };
  rateLimits: {
    loginAttempts: number;
    timeWindow: number;
  };
  security: {
    requireEmailVerification: boolean;
    enableTwoFactor: boolean;
    sessionTimeout: number;
  };
}

export interface LoginResult {
  success: boolean;
  user?: User;
  token?: string;
  requiresTwoFactor?: boolean;
  twoFactorToken?: string;
  message: string;
}

export interface RegisterResult {
  success: boolean;
  user?: User;
  token?: string;
  verificationToken?: string;
  message: string;
}

export class AuthenticationSystem {
  private config: AuthConfig;
  private loginAttempts: Map<string, { count: number; lastAttempt: number }> = new Map();

  constructor(config: Partial<AuthConfig> = {}) {
    this.config = {
      jwtSecret: process.env.JWT_SECRET || 'neurocore-super-secret-key-2024',
      jwtExpiration: '24h',
      bcryptRounds: 12,
      tokenExpiration: {
        emailVerification: 24 * 60 * 60 * 1000, // 24 hours
        passwordReset: 60 * 60 * 1000, // 1 hour
        twoFactor: 5 * 60 * 1000, // 5 minutes
      },
      rateLimits: {
        loginAttempts: 5,
        timeWindow: 15 * 60 * 1000, // 15 minutes
      },
      security: {
        requireEmailVerification: true,
        enableTwoFactor: false,
        sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
      },
      ...config
    };

    this.setupCleanupTasks();
  }

  // User Registration
  async register(userData: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
  }): Promise<RegisterResult> {
    try {
      // Validate input
      if (!this.validatePassword(userData.password)) {
        return {
          success: false,
          message: 'Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character'
        };
      }

      if (!this.validateEmail(userData.email)) {
        return {
          success: false,
          message: 'Please provide a valid email address'
        };
      }

      // Check if user already exists
      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, userData.email)
      });

      if (existingUser) {
        return {
          success: false,
          message: 'An account with this email already exists'
        };
      }

      const existingUsername = await db.query.users.findFirst({
        where: eq(users.username, userData.username)
      });

      if (existingUsername) {
        return {
          success: false,
          message: 'This username is already taken'
        };
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, this.config.bcryptRounds);

      // Create user
      const newUser = await db.insert(users).values({
        username: userData.username,
        email: userData.email,
        password: hashedPassword,
        displayName: userData.displayName || userData.username,
        isActive: !this.config.security.requireEmailVerification,
        preferences: {
          theme: 'light',
          language: 'auto',
          aiModel: 'neurocore-v1',
          responseStyle: 'casual',
          enableNotifications: true,
          autoSave: true,
          showTimestamps: false
        }
      }).returning();

      const user = newUser[0];

      // Generate JWT token
      const token = this.generateJWT(user);

      // Generate email verification token if required
      let verificationToken: string | undefined;
      if (this.config.security.requireEmailVerification) {
        verificationToken = await this.generateAuthToken(
          user.id,
          'email_verification',
          this.config.tokenExpiration.emailVerification
        );

        // TODO: Send verification email when email service is ready
        console.log(`Verification token for ${user.email}: ${verificationToken}`);
      }

      return {
        success: true,
        user,
        token,
        verificationToken,
        message: this.config.security.requireEmailVerification
          ? 'Account created successfully. Please check your email to verify your account.'
          : 'Account created successfully. Welcome to NeuroCore AI!'
      };

    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        message: 'An error occurred during registration. Please try again.'
      };
    }
  }

  // User Login
  async login(credentials: {
    email: string;
    password: string;
    twoFactorCode?: string;
    twoFactorToken?: string;
  }): Promise<LoginResult> {
    try {
      // Check rate limiting
      if (!this.checkRateLimit(credentials.email)) {
        return {
          success: false,
          message: 'Too many login attempts. Please try again later.'
        };
      }

      // Find user
      const user = await db.query.users.findFirst({
        where: eq(users.email, credentials.email)
      });

      if (!user) {
        this.recordFailedAttempt(credentials.email);
        return {
          success: false,
          message: 'Invalid email or password'
        };
      }

      // Check if account is active
      if (!user.isActive) {
        return {
          success: false,
          message: 'Account is not activated. Please check your email for verification instructions.'
        };
      }

      // Verify password
      const passwordValid = await bcrypt.compare(credentials.password, user.password);
      if (!passwordValid) {
        this.recordFailedAttempt(credentials.email);
        return {
          success: false,
          message: 'Invalid email or password'
        };
      }

      // Check for two-factor authentication
      const userTwoFactor = await db.query.twoFactorAuth.findFirst({
        where: and(
          eq(twoFactorAuth.userId, user.id),
          eq(twoFactorAuth.isEnabled, true)
        )
      });

      if (userTwoFactor) {
        // If two-factor is enabled, verify the code
        if (!credentials.twoFactorCode || !credentials.twoFactorToken) {
          // Generate temporary token for two-factor verification
          const twoFactorToken = await this.generateAuthToken(
            user.id,
            '2fa',
            this.config.tokenExpiration.twoFactor
          );

          return {
            success: false,
            requiresTwoFactor: true,
            twoFactorToken,
            message: 'Two-factor authentication required'
          };
        }

        // Verify two-factor token
        const tokenValid = await this.verifyAuthToken(credentials.twoFactorToken, '2fa');
        if (!tokenValid || tokenValid.userId !== user.id) {
          return {
            success: false,
            message: 'Invalid or expired two-factor token'
          };
        }

        // Verify two-factor code
        const codeValid = speakeasy.totp.verify({
          secret: userTwoFactor.secret,
          encoding: 'base32',
          token: credentials.twoFactorCode,
          window: 2
        });

        if (!codeValid) {
          return {
            success: false,
            message: 'Invalid two-factor authentication code'
          };
        }

        // Mark token as used
        await this.markTokenAsUsed(credentials.twoFactorToken);

        // Update last used timestamp
        await db.update(twoFactorAuth)
          .set({ lastUsed: new Date() })
          .where(eq(twoFactorAuth.id, userTwoFactor.id));
      }

      // Generate JWT token
      const token = this.generateJWT(user);

      // Create session
      await this.createSession(user.id, token);

      // Clear rate limiting
      this.clearRateLimit(credentials.email);

      return {
        success: true,
        user,
        token,
        message: 'Login successful'
      };

    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        message: 'An error occurred during login. Please try again.'
      };
    }
  }

  // Email Verification
  async verifyEmail(token: string): Promise<{ success: boolean; message: string }> {
    try {
      const authToken = await this.verifyAuthToken(token, 'email_verification');
      if (!authToken) {
        return {
          success: false,
          message: 'Invalid or expired verification token'
        };
      }

      // Activate user account
      await db.update(users)
        .set({ isActive: true })
        .where(eq(users.id, authToken.userId));

      // Mark token as used
      await this.markTokenAsUsed(token);

      return {
        success: true,
        message: 'Email verified successfully. Your account is now active.'
      };
    } catch (error) {
      console.error('Email verification error:', error);
      return {
        success: false,
        message: 'An error occurred during email verification'
      };
    }
  }

  // Password Reset Request
  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.email, email)
      });

      if (!user) {
        // Don't reveal whether email exists or not
        return {
          success: true,
          message: 'If an account with this email exists, you will receive password reset instructions.'
        };
      }

      // Generate password reset token
      const resetToken = await this.generateAuthToken(
        user.id,
        'password_reset',
        this.config.tokenExpiration.passwordReset
      );

      // TODO: Send password reset email when email service is ready
      console.log(`Password reset token for ${user.email}: ${resetToken}`);

      return {
        success: true,
        message: 'If an account with this email exists, you will receive password reset instructions.'
      };
    } catch (error) {
      console.error('Password reset request error:', error);
      return {
        success: false,
        message: 'An error occurred while processing your request'
      };
    }
  }

  // Reset Password
  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.validatePassword(newPassword)) {
        return {
          success: false,
          message: 'Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character'
        };
      }

      const authToken = await this.verifyAuthToken(token, 'password_reset');
      if (!authToken) {
        return {
          success: false,
          message: 'Invalid or expired reset token'
        };
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, this.config.bcryptRounds);

      // Update user password
      await db.update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, authToken.userId!));

      // Mark token as used
      await this.markTokenAsUsed(token);

      // Invalidate all existing sessions for this user
      await this.invalidateUserSessions(authToken.userId!);

      return {
        success: true,
        message: 'Password reset successfully. Please log in with your new password.'
      };
    } catch (error) {
      console.error('Password reset error:', error);
      return {
        success: false,
        message: 'An error occurred while resetting your password'
      };
    }
  }

  // Two-Factor Authentication Setup
  async setupTwoFactor(userId: number): Promise<{
    success: boolean;
    secret?: string;
    qrCode?: string;
    backupCodes?: string[];
    message: string;
  }> {
    try {
      // Check if 2FA is already enabled
      const existing = await db.query.twoFactorAuth.findFirst({
        where: and(
          eq(twoFactorAuth.userId, userId),
          eq(twoFactorAuth.isEnabled, true)
        )
      });

      if (existing) {
        return {
          success: false,
          message: 'Two-factor authentication is already enabled for this account'
        };
      }

      // Generate secret
      const secret = speakeasy.generateSecret({
        name: 'NeuroCore AI',
        length: 32
      });

      // Generate backup codes
      const backupCodes = Array.from({ length: 8 }, () => 
        crypto.randomBytes(4).toString('hex').toUpperCase()
      );

      // Generate QR code
      const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

      // Save to database (not enabled yet)
      await db.insert(twoFactorAuth).values({
        userId,
        secret: secret.base32,
        backupCodes,
        isEnabled: false
      });

      return {
        success: true,
        secret: secret.base32,
        qrCode,
        backupCodes,
        message: 'Two-factor authentication setup initiated. Please verify with your authenticator app.'
      };
    } catch (error) {
      console.error('2FA setup error:', error);
      return {
        success: false,
        message: 'An error occurred while setting up two-factor authentication'
      };
    }
  }

  // Enable Two-Factor Authentication
  async enableTwoFactor(userId: number, verificationCode: string): Promise<{ success: boolean; message: string }> {
    try {
      const twoFA = await db.query.twoFactorAuth.findFirst({
        where: and(
          eq(twoFactorAuth.userId, userId),
          eq(twoFactorAuth.isEnabled, false)
        )
      });

      if (!twoFA) {
        return {
          success: false,
          message: 'Two-factor authentication setup not found. Please start setup again.'
        };
      }

      // Verify the code
      const verified = speakeasy.totp.verify({
        secret: twoFA.secret,
        encoding: 'base32',
        token: verificationCode,
        window: 2
      });

      if (!verified) {
        return {
          success: false,
          message: 'Invalid verification code. Please try again.'
        };
      }

      // Enable 2FA
      await db.update(twoFactorAuth)
        .set({ isEnabled: true })
        .where(eq(twoFactorAuth.id, twoFA.id));

      return {
        success: true,
        message: 'Two-factor authentication enabled successfully'
      };
    } catch (error) {
      console.error('2FA enable error:', error);
      return {
        success: false,
        message: 'An error occurred while enabling two-factor authentication'
      };
    }
  }

  // Utility Methods
  private generateJWT(user: User): string {
    return jwt.sign(
      {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      this.config.jwtSecret,
      { expiresIn: this.config.jwtExpiration }
    );
  }

  private async generateAuthToken(userId: number, type: string, expiresIn: number): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiresIn);

    await db.insert(authTokens).values({
      userId,
      token,
      type,
      expiresAt,
      isUsed: false
    });

    return token;
  }

  private async verifyAuthToken(token: string, type: string): Promise<AuthToken | null> {
    const authToken = await db.query.authTokens.findFirst({
      where: and(
        eq(authTokens.token, token),
        eq(authTokens.type, type),
        eq(authTokens.isUsed, false),
        gt(authTokens.expiresAt, new Date())
      )
    });

    return authToken || null;
  }

  private async markTokenAsUsed(token: string): Promise<void> {
    await db.update(authTokens)
      .set({ isUsed: true })
      .where(eq(authTokens.token, token));
  }

  private async createSession(userId: number, token: string): Promise<void> {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.config.security.sessionTimeout);

    await db.insert(sessions).values({
      id: sessionId,
      userId,
      expiresAt,
      data: { token }
    });
  }

  private async invalidateUserSessions(userId: number): Promise<void> {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  }

  private checkRateLimit(identifier: string): boolean {
    const now = Date.now();
    const attempts = this.loginAttempts.get(identifier);

    if (!attempts) return true;

    if (now - attempts.lastAttempt > this.config.rateLimits.timeWindow) {
      this.loginAttempts.delete(identifier);
      return true;
    }

    return attempts.count < this.config.rateLimits.loginAttempts;
  }

  private recordFailedAttempt(identifier: string): void {
    const now = Date.now();
    const attempts = this.loginAttempts.get(identifier) || { count: 0, lastAttempt: now };

    attempts.count++;
    attempts.lastAttempt = now;

    this.loginAttempts.set(identifier, attempts);
  }

  private clearRateLimit(identifier: string): void {
    this.loginAttempts.delete(identifier);
  }

  private validatePassword(password: string): boolean {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasNonalphas = /\W/.test(password);

    return password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers && hasNonalphas;
  }

  private validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private setupCleanupTasks(): void {
    // Clean up expired tokens every hour
    setInterval(async () => {
      try {
        // Clean up expired tokens and sessions
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        await db.delete(authTokens).where(
          and(
            eq(authTokens.isUsed, true)
          )
        );

        await db.delete(sessions).where(
          gt(sessions.expiresAt, new Date())
        );
      } catch (error) {
        console.error('Cleanup task error:', error);
      }
    }, 60 * 60 * 1000); // Run every hour
  }

  // Public methods for token verification
  verifyJWT(token: string): any {
    try {
      return jwt.verify(token, this.config.jwtSecret);
    } catch {
      return null;
    }
  }

  async getUserFromToken(token: string): Promise<User | null> {
    const decoded = this.verifyJWT(token);
    if (!decoded) return null;

    const user = await db.query.users.findFirst({
      where: eq(users.id, decoded.userId)
    });

    return user || null;
  }
}

// Create singleton instance
export const authSystem = new AuthenticationSystem();