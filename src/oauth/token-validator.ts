/**
 * OAuth token validation and refresh utilities
 */

import * as core from "@actions/core";

interface TokenInfo {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

/**
 * Check if the OAuth token is expired or will expire soon
 * @param expiresAt - Unix timestamp in milliseconds as string
 * @param bufferMinutes - Minutes before expiration to consider token as expired (default: 5)
 * @returns true if token is expired or will expire soon
 */
export function isTokenExpired(expiresAt: string, bufferMinutes: number = 5): boolean {
  try {
    const expirationTime = parseInt(expiresAt, 10);
    const currentTime = Date.now();
    const bufferMs = bufferMinutes * 60 * 1000;
    
    const isExpired = currentTime >= (expirationTime - bufferMs);
    
    if (isExpired) {
      const expirationDate = new Date(expirationTime);
      const currentDate = new Date(currentTime);
      core.warning(
        `OAuth token is expired or will expire soon. ` +
        `Expiration: ${expirationDate.toISOString()}, ` +
        `Current: ${currentDate.toISOString()}`
      );
    }
    
    return isExpired;
  } catch (error) {
    core.error(`Failed to parse token expiration time: ${error}`);
    return true; // Assume expired if we can't parse
  }
}

/**
 * Validate OAuth token configuration
 * @returns TokenInfo if valid, throws error otherwise
 */
export function validateOAuthTokens(): TokenInfo {
  const accessToken = process.env.INPUT_CLAUDE_ACCESS_TOKEN || process.env.CLAUDE_ACCESS_TOKEN || "";
  const refreshToken = process.env.INPUT_CLAUDE_REFRESH_TOKEN || process.env.CLAUDE_REFRESH_TOKEN || "";
  const expiresAt = process.env.INPUT_CLAUDE_EXPIRES_AT || process.env.CLAUDE_EXPIRES_AT || "";
  
  if (!accessToken || !refreshToken || !expiresAt) {
    throw new Error(
      "OAuth authentication requires claude_access_token, claude_refresh_token, and claude_expires_at"
    );
  }
  
  // Check if token is expired
  if (isTokenExpired(expiresAt)) {
    throw new Error(
      "OAuth token has expired. Please update your GitHub Secrets with fresh tokens from Claude.ai:\n" +
      "1. Go to https://claude.ai/settings/account\n" +
      "2. Generate new OAuth tokens\n" +
      "3. Update CLAUDE_ACCESS_TOKEN, CLAUDE_REFRESH_TOKEN, and CLAUDE_EXPIRES_AT in your repository secrets"
    );
  }
  
  return { accessToken, refreshToken, expiresAt };
}

/**
 * Get remaining time until token expiration
 * @param expiresAt - Unix timestamp in milliseconds as string
 * @returns Human-readable string of remaining time
 */
export function getRemainingTokenTime(expiresAt: string): string {
  try {
    const expirationTime = parseInt(expiresAt, 10);
    const currentTime = Date.now();
    const remainingMs = expirationTime - currentTime;
    
    if (remainingMs <= 0) {
      return "expired";
    }
    
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  } catch (error) {
    return "unknown";
  }
}
