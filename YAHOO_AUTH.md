# Yahoo OAuth Token Management

This project uses automated token refresh to avoid the "invalid refresh token" issue.

## How It Works

1. **Automatic refresh on every run** — The GitHub Actions workflow calls `token-manager.ts` to refresh the token before fetching data
2. **Local token cache** — Refreshed tokens are stored in `token-cache.json` (not committed to git)
3. **Graceful fallback** — If the cached token expires or refresh fails, the next run will automatically try again
4. **GitHub secrets sync** — The workflow updates the `YAHOO_REFRESH_TOKEN` secret after each refresh (best-effort)

## Local Development

### Get a fresh access token:
```bash
npx tsx scripts/token-manager.ts refresh
```

This creates `token-cache.json` with a fresh access token.

### Check your current token:
```bash
npx tsx scripts/token-manager.ts get-token
```

### Re-authenticate (if refresh token expires):
If you get an "INVALID_REFRESH_TOKEN" error, you need to re-authenticate:

1. Get your `YAHOO_CLIENT_ID` from `.env` (or `/Users/mattbrudner/Projects/yahoo-fantasy-baseball-mcp/.env`)
2. Visit this URL in your browser (replace `YOUR_CLIENT_ID`):
   ```
   https://api.login.yahoo.com/oauth2/request_auth?client_id=YOUR_CLIENT_ID&redirect_uri=oob&response_type=code
   ```
3. Authorize and copy the authorization code
4. Run:
   ```bash
   npx tsx scripts/auth.ts YOUR_CODE
   ```
5. Update your GitHub secret with the new refresh token:
   ```bash
   REFRESH_TOKEN=$(jq -r '.refreshToken' token-cache.json)
   gh secret set YAHOO_REFRESH_TOKEN --body "$REFRESH_TOKEN"
   ```

## Troubleshooting

### "YAHOO_REFRESH_TOKEN not found in environment or .env"
Make sure `YAHOO_REFRESH_TOKEN` is set in one of:
- `YAHOO_REFRESH_TOKEN` GitHub secret
- `.env` file in the repo root or `../../yahoo-fantasy-baseball-mcp/.env`

### "INVALID_REFRESH_TOKEN: Your refresh token has expired or is invalid"
The refresh token has expired and needs re-authentication. Follow the "Re-authenticate" steps above.

### Token refresh fails in GitHub Actions
Check that:
1. `YAHOO_CLIENT_ID` and `YAHOO_CLIENT_SECRET` secrets are set
2. `YAHOO_REFRESH_TOKEN` secret is set with a valid token
3. The `GH_PAT` secret has permission to update secrets (if you want automatic secret updates)

Even if the GitHub secret update fails, the workflow will still work because:
- The token is refreshed and used for the current run
- The next run will refresh again from the stored `YAHOO_REFRESH_TOKEN`

## How It Prevents "Invalid Refresh Token"

**Before:** You manually updated the secret, which was error-prone and tokens could expire between updates.

**After:**
- Every workflow run automatically refreshes the token
- Token cache acts as a safety net if the secret gets out of sync
- Clear error messages if something goes wrong
- Easy re-authentication path if needed
