import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { query } from '../database/connection.js';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// JWT Strategy
passport.use(new JwtStrategy({
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET || 'fallback-secret'
}, async (payload, done) => {
  try {
    const userResult = await query(
      'SELECT id, username, email, role, preferences FROM users WHERE id = $1 AND is_active = true',
      [payload.userId]
    );

    if (userResult.rows.length === 0) {
      return done(null, false);
    }

    return done(null, userResult.rows[0]);
  } catch (error) {
    return done(error, false);
  }
}));

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback'
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user already exists
      const existingUser = await query(
        'SELECT * FROM users WHERE google_id = $1 OR email = $2',
        [profile.id, profile.emails?.[0]?.value]
      );

      if (existingUser.rows.length > 0) {
        const user = existingUser.rows[0] as any;
        
        // Update Google ID if not set
        if (!user.google_id) {
          await query(
            'UPDATE users SET google_id = $1, avatar_url = $2 WHERE id = $3',
            [profile.id, profile.photos?.[0]?.value, user.id]
          );
        }

        // Update last login
        await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

        logger.info('Google OAuth login', { userId: user.id, email: user.email });
        return done(null, user);
      }

      // Create new user
      const userId = uuidv4();
      const email = profile.emails?.[0]?.value;
      const username = profile.displayName?.replace(/\s+/g, '_').toLowerCase() || email?.split('@')[0];
      
      // Ensure username is unique
      let finalUsername = username;
      let counter = 1;
      while (true) {
        const usernameCheck = await query(
          'SELECT id FROM users WHERE username = $1',
          [finalUsername]
        );
        
        if (usernameCheck.rows.length === 0) break;
        finalUsername = `${username}_${counter}`;
        counter++;
      }

      const defaultPreferences = {
        theme: 'light',
        defaultModel: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 2048,
        language: 'en'
      };

      await query(
        `INSERT INTO users (
          id, username, email, google_id, avatar_url, role, 
          preferences, is_active, email_verified
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          userId, 
          finalUsername, 
          email, 
          profile.id, 
          profile.photos?.[0]?.value,
          'free',
          JSON.stringify(defaultPreferences),
          true,
          true // Google accounts are pre-verified
        ]
      );

      const newUser = {
        id: userId,
        username: finalUsername,
        email,
        google_id: profile.id,
        avatar_url: profile.photos?.[0]?.value,
        role: 'free',
        preferences: defaultPreferences,
        is_active: true
      };

      logger.info('New user created via Google OAuth', { userId, email });
      return done(null, newUser);

    } catch (error) {
      logger.error('Google OAuth error', { error: error.message });
      return done(error, false);
    }
  }));
}

// Serialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const userResult = await query(
      'SELECT id, username, email, role, preferences, avatar_url FROM users WHERE id = $1 AND is_active = true',
      [id]
    );

    if (userResult.rows.length === 0) {
      return done(null, false);
    }

    done(null, userResult.rows[0]);
  } catch (error) {
    done(error, false);
  }
});

export default passport;
