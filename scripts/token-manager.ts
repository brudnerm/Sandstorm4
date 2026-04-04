import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const command = process.argv[2];

if (command === 'refresh') {
  const clientId = process.env.YAHOO_CLIENT_ID;
  const clientSecret = process.env.YAHOO_CLIENT_SECRET;
  const refreshToken = process.env.YAHOO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing required environment variables: YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET, YAHOO_REFRESH_TOKEN');
  }

  console.log('[INFO] Refreshing Yahoo OAuth token...');

  try {
    const response = execSync(
      `curl -s -X POST "https://api.login.yahoo.com/oauth2/get_token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "grant_type=refresh_token" \
        -d "refresh_token=${encodeURIComponent(refreshToken)}" \
        -d "client_id=${encodeURIComponent(clientId)}" \
        -d "client_secret=${encodeURIComponent(clientSecret)}"`,
      { encoding: 'utf8' }
    );

    const data = JSON.parse(response);

    if (data.error) {
      throw new Error(`Yahoo API error: ${data.error}`);
    }

    const cache = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      timestamp: new Date().toISOString(),
    };

    writeFileSync('token-cache.json', JSON.stringify(cache, null, 2));
    console.log('[INFO] Token refreshed successfully');
  } catch (error) {
    console.error('Error refreshing token:', error);
    throw error;
  }
} else {
  console.error('Unknown command:', command);
  process.exit(1);
}
