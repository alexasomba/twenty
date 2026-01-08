/**
 * Workspace Context Middleware
 *
 * Extracts workspace and user information from JWT tokens
 * and makes it available to downstream handlers.
 *
 * @module middleware/workspace
 */

import type { Context, MiddlewareHandler } from 'hono';

import type { HonoEnv } from 'src/router';

/**
 * Workspace context extracted from token
 */
export interface WorkspaceContextData {
  workspaceId: string;
  userId: string;
  userWorkspaceId?: string;
}

/**
 * JWT payload structure
 */
interface JWTPayload {
  sub: string; // User ID
  workspaceId: string;
  userWorkspaceId?: string;
  type: 'ACCESS' | 'REFRESH';
  iat: number;
  exp: number;
}

/**
 * Extract Bearer token from Authorization header
 */
const extractBearerToken = (authHeader: string | undefined): string | null => {
  if (!authHeader) {
    return null;
  }

  const [type, token] = authHeader.split(' ');

  if (type !== 'Bearer' || !token) {
    return null;
  }

  return token;
};

/**
 * Decode JWT without verification (verification should be done separately)
 *
 * Note: This is a simple base64 decode. For production, use proper JWT
 * verification with the secret key via Web Crypto API.
 */
const decodeJWT = (token: string): JWTPayload | null => {
  try {
    const [, payloadB64] = token.split('.');

    if (!payloadB64) {
      return null;
    }

    // Decode base64url to base64
    const base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));

    return payload as JWTPayload;
  } catch {
    return null;
  }
};

/**
 * Verify JWT signature using Web Crypto API
 */
const verifyJWTSignature = async (
  token: string,
  secret: string,
): Promise<boolean> => {
  try {
    const [headerB64, payloadB64, signatureB64] = token.split('.');

    if (!headerB64 || !payloadB64 || !signatureB64) {
      return false;
    }

    // Import the secret key
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    // Decode the signature from base64url
    const signatureStr = signatureB64.replace(/-/g, '+').replace(/_/g, '/');
    const signatureBytes = Uint8Array.from(atob(signatureStr), (c) =>
      c.charCodeAt(0),
    );

    // Create the data to verify
    const data = encoder.encode(`${headerB64}.${payloadB64}`);

    // Verify the signature
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      data,
    );

    return isValid;
  } catch {
    return false;
  }
};

/**
 * Check if token is expired
 */
const isTokenExpired = (payload: JWTPayload): boolean => {
  const now = Math.floor(Date.now() / 1000);

  return payload.exp < now;
};

/**
 * Workspace context middleware
 *
 * Extracts and validates workspace context from JWT token.
 * Sets workspaceId and userId on the Hono context variables.
 */
export const workspaceMiddleware: MiddlewareHandler<HonoEnv> = async (
  c: Context<HonoEnv>,
  next,
) => {
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    // No token - continue without workspace context
    // Some endpoints may not require authentication
    return next();
  }

  // Decode the token
  const payload = decodeJWT(token);

  if (!payload) {
    return c.json(
      {
        error: 'Invalid token',
        message: 'The provided token is malformed',
      },
      401,
    );
  }

  // Check expiration
  if (isTokenExpired(payload)) {
    return c.json(
      {
        error: 'Token expired',
        message: 'The provided token has expired',
      },
      401,
    );
  }

  // Verify signature (if JWT_SECRET is available)
  const jwtSecret = c.env.JWT_SECRET;

  if (jwtSecret) {
    const isValid = await verifyJWTSignature(token, jwtSecret);

    if (!isValid) {
      return c.json(
        {
          error: 'Invalid signature',
          message: 'Token signature verification failed',
        },
        401,
      );
    }
  }

  // Validate token type
  if (payload.type !== 'ACCESS') {
    return c.json(
      {
        error: 'Invalid token type',
        message: 'An access token is required',
      },
      401,
    );
  }

  // Set workspace context on Hono variables
  c.set('workspaceId', payload.workspaceId);
  c.set('userId', payload.sub);

  return next();
};

/**
 * Require authentication middleware
 *
 * Use this for routes that must have a valid workspace context.
 * Should be used after workspaceMiddleware.
 */
export const requireAuth: MiddlewareHandler<HonoEnv> = async (
  c: Context<HonoEnv>,
  next,
) => {
  const workspaceId = c.get('workspaceId');
  const userId = c.get('userId');

  if (!workspaceId || !userId) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Authentication is required for this endpoint',
      },
      401,
    );
  }

  return next();
};

/**
 * Get workspace context from Hono context
 *
 * Throws if workspace context is not available.
 */
export const getWorkspaceContext = (
  c: Context<HonoEnv>,
): WorkspaceContextData => {
  const workspaceId = c.get('workspaceId');
  const userId = c.get('userId');

  if (!workspaceId || !userId) {
    throw new Error('Workspace context not available');
  }

  return {
    workspaceId,
    userId,
  };
};
