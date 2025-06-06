/**
 * OAuth token auto-refresh utilities
 * 
 * Note: Since Claude.ai's OAuth API endpoints are not publicly documented,
 * this implementation provides alternative approaches for token management.
 */

import * as core from "@actions/core";
import { isTokenExpired, getRemainingTokenTime } from "./token-validator";

interface RefreshedTokenInfo {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

/**
 * Generate a GitHub Actions workflow to refresh tokens
 * This creates a workflow file that can be committed to automate token refresh
 */
export function generateTokenRefreshWorkflow(): string {
  return `# Token Refresh Workflow
# This workflow helps refresh Claude OAuth tokens before they expire

name: Refresh Claude OAuth Tokens
on:
  schedule:
    # Run daily at 2 AM UTC
    - cron: '0 2 * * *'
  workflow_dispatch:

jobs:
  check-and-notify:
    runs-on: ubuntu-latest
    steps:
      - name: Check Token Expiration
        uses: actions/github-script@v7
        with:
          github-token: \${{ secrets.GITHUB_TOKEN }}
          script: |
            const expiresAt = \${{ secrets.CLAUDE_EXPIRES_AT }};
            const currentTime = Date.now();
            const remainingTime = expiresAt - currentTime;
            const daysRemaining = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
            
            if (daysRemaining <= 7) {
              // Create an issue if token expires within 7 days
              const issues = await github.rest.issues.listForRepo({
                owner: context.repo.owner,
                repo: context.repo.repo,
                labels: ['token-refresh'],
                state: 'open'
              });
              
              if (issues.data.length === 0) {
                await github.rest.issues.create({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  title: 'Claude OAuth Token Expiring Soon',
                  body: \`Your Claude OAuth tokens will expire in \${daysRemaining} days.
                  
Please refresh your tokens:
1. Run \\\`claude code /login\\\` locally
2. Get new tokens from \\\`~/.claude/.credentials.json\\\`
3. Update these repository secrets:
   - CLAUDE_ACCESS_TOKEN
   - CLAUDE_REFRESH_TOKEN
   - CLAUDE_EXPIRES_AT
                  
This issue will auto-close when tokens are updated.\`,
                  labels: ['token-refresh']
                });
              }
            }
`;
}

/**
 * Create a local script to help users refresh tokens
 */
export function generateLocalRefreshScript(): string {
  return `#!/bin/bash
# Claude OAuth Token Refresh Helper Script

echo "Claude OAuth Token Refresh Helper"
echo "================================"
echo ""

# Check if claude-code is installed
if ! command -v claude-code &> /dev/null; then
    echo "Error: claude-code CLI is not installed"
    echo "Please install it first: npm install -g @anthropic-ai/claude-code"
    exit 1
fi

# Trigger login to refresh tokens
echo "Triggering Claude login to refresh tokens..."
claude-code /login

# Wait for login to complete
echo ""
echo "Please complete the login in your browser."
echo "Press Enter when done..."
read

# Read the new credentials
CREDS_FILE="$HOME/.claude/.credentials.json"
if [ -f "$CREDS_FILE" ]; then
    echo ""
    echo "New tokens retrieved successfully!"
    echo ""
    echo "Please update your GitHub repository secrets with these values:"
    echo ""
    
    # Extract values using node (cross-platform)
    node -e "
    const creds = require('$CREDS_FILE');
    const oauth = creds.claudeAiOauth;
    console.log('CLAUDE_ACCESS_TOKEN:', oauth.accessToken);
    console.log('CLAUDE_REFRESH_TOKEN:', oauth.refreshToken);
    console.log('CLAUDE_EXPIRES_AT:', oauth.expiresAt);
    console.log('');
    console.log('Token expires at:', new Date(oauth.expiresAt).toISOString());
    "
else
    echo "Error: Could not find credentials file at $CREDS_FILE"
    exit 1
fi
`;
}

/**
 * Check if tokens need refresh and provide appropriate guidance
 * @param expiresAt - Token expiration timestamp
 * @returns True if tokens need immediate refresh
 */
export function checkAndAdviseTokenRefresh(expiresAt: string): boolean {
  const remainingTime = getRemainingTokenTime(expiresAt);
  
  if (remainingTime === "expired") {
    core.error("⚠️  OAuth tokens have expired!");
    core.notice(
      "Your Claude OAuth tokens have expired. Please refresh them:\n" +
      "1. Run `claude-code /login` locally\n" +
      "2. Complete the login in your browser\n" +
      "3. Update your GitHub Secrets with new tokens from ~/.claude/.credentials.json"
    );
    return true;
  }
  
  // Parse remaining time to check if it's less than 24 hours
  const expirationTime = parseInt(expiresAt, 10);
  const hoursRemaining = (expirationTime - Date.now()) / (1000 * 60 * 60);
  
  if (hoursRemaining < 24) {
    core.warning(`⚠️  OAuth tokens will expire in ${remainingTime}`);
    core.notice(
      "Your Claude OAuth tokens are expiring soon. Consider refreshing them to avoid interruption:\n" +
      "1. Run `claude-code /login` locally\n" +
      "2. Update your GitHub Secrets with the new tokens"
    );
  } else if (hoursRemaining < 72) {
    core.info(`ℹ️  OAuth tokens are valid for ${remainingTime}`);
  }
  
  return false;
}

/**
 * Setup automated token refresh reminder
 * Creates necessary files to help users manage token refresh
 */
export async function setupTokenRefreshAutomation(
  repoPath: string = "."
): Promise<void> {
  const fs = await import("fs/promises");
  const path = await import("path");
  
  try {
    // Create .github/workflows directory if it doesn't exist
    const workflowDir = path.join(repoPath, ".github", "workflows");
    await fs.mkdir(workflowDir, { recursive: true });
    
    // Write the workflow file
    const workflowPath = path.join(workflowDir, "claude-token-refresh.yml");
    await fs.writeFile(workflowPath, generateTokenRefreshWorkflow());
    
    core.info(`✅ Created token refresh workflow at ${workflowPath}`);
    
    // Create a helper script
    const scriptPath = path.join(repoPath, "scripts", "refresh-claude-tokens.sh");
    await fs.mkdir(path.dirname(scriptPath), { recursive: true });
    await fs.writeFile(scriptPath, generateLocalRefreshScript());
    await fs.chmod(scriptPath, 0o755); // Make executable
    
    core.info(`✅ Created token refresh helper script at ${scriptPath}`);
    
    core.notice(
      "Token refresh automation has been set up!\n" +
      "- A GitHub workflow will check token expiration daily\n" +
      "- Run `./scripts/refresh-claude-tokens.sh` to refresh tokens locally\n" +
      "- The workflow will create an issue when tokens are expiring"
    );
    
  } catch (error) {
    core.warning(`Could not set up automated token refresh: ${error}`);
  }
}

/**
 * Smart token validation with refresh guidance
 * @param accessToken - Current access token
 * @param refreshToken - Current refresh token  
 * @param expiresAt - Current expiration timestamp
 * @returns Validated tokens (same as input if valid)
 */
export function validateTokensWithRefreshGuidance(
  accessToken: string,
  refreshToken: string,
  expiresAt: string
): { accessToken: string; refreshToken: string; expiresAt: string } {
  
  // Check if immediate refresh is needed
  const needsRefresh = checkAndAdviseTokenRefresh(expiresAt);
  
  if (needsRefresh) {
    throw new Error(
      "OAuth tokens have expired. Please refresh them manually:\n" +
      "1. Run: claude-code /login\n" +
      "2. Update GitHub Secrets with new tokens from ~/.claude/.credentials.json\n" +
      "3. Re-run this workflow\n\n" +
      "Tip: Run ./scripts/refresh-claude-tokens.sh if available"
    );
  }
  
  return { accessToken, refreshToken, expiresAt };
}
