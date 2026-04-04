#!/usr/bin/env tsx
/**
 * Yahoo OAuth token manager
 * Handles refreshing tokens and persisting them locally
 *
 * Usage:
 *   npx tsx scripts/token-manager.ts refresh    # Refresh and save token
 *   npx tsx scripts/token-manager.ts get-token  # Get current access token
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import https from 'https'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const TOKEN_CACHE_PATH = path.join(PROJECT_ROOT, 'token-cache.json')
const MCP_DIR = path.resolve(__dirname, '../../yahoo-fantasy-baseball-mcp')
const ENV_PATH = path.join(MCP_DIR, '.env')

interface TokenCache {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

function readEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx < 0) continue
      const key = trimmed.slice(0, idx).trim()
      const val = trimmed.slice(idx + 1).trim()
      if (key) out[key] = val
    }
  } catch {
    /* ignore */
  }
  return out
}

function getRefreshToken(): string {
  // Try GitHub Actions environment first (CI mode)
  if (process.env.YAHOO_REFRESH_TOKEN) {
    return process.env.YAHOO_REFRESH_TOKEN
  }

  // Fall back to local .env
  const env = readEnv()
  const token = env['YAHOO_REFRESH_TOKEN']
  if (!token) throw new Error('YAHOO_REFRESH_TOKEN not found in environment or .env')
  return token
}

function getClientCredentials(): { id: string; secret: string } {
  const ciId = process.env.YAHOO_CLIENT_ID
  const ciSecret = process.env.YAHOO_CLIENT_SECRET

  if (ciId && ciSecret) {
    return { id: ciId, secret: ciSecret }
  }

  const env = readEnv()
  const id = env['YAHOO_CLIENT_ID']
  const secret = env['YAHOO_CLIENT_SECRET']

  if (!id || !secret) {
    throw new Error('YAHOO_CLIENT_ID or YAHOO_CLIENT_SECRET not found')
  }

  return { id, secret }
}

function loadTokenCache(): TokenCache | null {
  try {
    const data = readFileSync(TOKEN_CACHE_PATH, 'utf8')
    return JSON.parse(data)
  } catch {
    return null
  }
}

function saveTokenCache(cache: TokenCache): void {
  writeFileSync(TOKEN_CACHE_PATH, JSON.stringify(cache, null, 2))
  console.log(`[OK] Token cache saved to ${TOKEN_CACHE_PATH}`)
}

async function refreshToken(refreshToken: string): Promise<TokenCache> {
  const { id, secret } = getClientCredentials()
  const credentials = Buffer.from(`${id}:${secret}`).toString('base64')

  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      grant_type: 'refresh_token',
      redirect_uri: 'oob',
      refresh_token: refreshToken,
    }).toString()

    const options = {
      hostname: 'api.login.yahoo.com',
      path: '/oauth2/get_token',
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          try {
            const error = JSON.parse(data)
            if (error.error === 'invalid_grant') {
              reject(
                new Error(
                  'INVALID_REFRESH_TOKEN: Your refresh token has expired or is invalid. ' +
                    'You need to re-authenticate with Yahoo to get new tokens.',
                ),
              )
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${error.error_description || data}`))
            }
          } catch {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`))
          }
          return
        }

        try {
          const response = JSON.parse(data)
          const accessToken = response.access_token
          const newRefreshToken = response.refresh_token
          const expiresIn = response.expires_in || 3600

          if (!accessToken) {
            reject(new Error(`No access_token in response: ${data}`))
            return
          }

          resolve({
            accessToken,
            refreshToken: newRefreshToken || refreshToken,
            expiresAt: Date.now() + expiresIn * 1000,
          })
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data.slice(0, 200)}`))
        }
      })
    })

    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}

async function doRefresh(): Promise<void> {
  console.log('[INFO] Refreshing Yahoo OAuth token...')

  try {
    const refreshTokenValue = getRefreshToken()
    const newCache = await refreshToken(refreshTokenValue)
    saveTokenCache(newCache)

    // Output for GitHub Actions
    console.log(`::add-mask::${newCache.accessToken}`)
    console.log(`::add-mask::${newCache.refreshToken}`)
    console.log(`::set-output name=access_token::${newCache.accessToken}`)
    console.log(`::set-output name=refresh_token::${newCache.refreshToken}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ERROR] ${message}`)

    if (message.includes('INVALID_REFRESH_TOKEN')) {
      console.error(
        '\n⚠️  Your refresh token has expired. Follow these steps to re-authenticate:\n' +
          '1. Go to: https://api.login.yahoo.com/oauth2/request_auth?client_id=YOUR_CLIENT_ID&redirect_uri=oob&response_type=code\n' +
          '2. Authorize the app and copy the code\n' +
          '3. Run: npx tsx scripts/auth.ts YOUR_CODE\n' +
          '4. This will give you new tokens to set in .env or GitHub secrets\n',
      )
    }

    process.exit(1)
  }
}

async function getToken(): Promise<void> {
  // Try cache first
  const cache = loadTokenCache()
  if (cache && cache.expiresAt > Date.now() + 5 * 60 * 1000) {
    // Token is still valid for 5+ more minutes
    console.log(cache.accessToken)
    return
  }

  // Cache missing or expired, refresh
  console.log('[INFO] Token cache missing or expired, refreshing...', { isStderr: true })
  try {
    const refreshTokenValue = getRefreshToken()
    const newCache = await refreshToken(refreshTokenValue)
    saveTokenCache(newCache)
    console.log(newCache.accessToken)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ERROR] Failed to get token: ${message}`)
    process.exit(1)
  }
}

// Main
const command = process.argv[2]

if (command === 'refresh') {
  doRefresh()
} else if (command === 'get-token') {
  getToken()
} else {
  console.error('Usage: npx tsx scripts/token-manager.ts [refresh|get-token]')
  process.exit(1)
}
