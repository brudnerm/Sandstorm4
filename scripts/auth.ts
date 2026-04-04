#!/usr/bin/env tsx
/**
 * Yahoo OAuth authentication helper
 * Use this to get fresh tokens if your refresh token expires
 *
 * Usage:
 *   1. Go to: https://api.login.yahoo.com/oauth2/request_auth?client_id=<YOUR_CLIENT_ID>&redirect_uri=oob&response_type=code
 *   2. Authorize and copy the code
 *   3. Run: npx tsx scripts/auth.ts <CODE>
 */

import { readFileSync, writeFileSync } from 'fs'
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

function getClientCredentials(): { id: string; secret: string } {
  const env = readEnv()
  const id = env['YAHOO_CLIENT_ID']
  const secret = env['YAHOO_CLIENT_SECRET']

  if (!id || !secret) {
    throw new Error(
      'YAHOO_CLIENT_ID or YAHOO_CLIENT_SECRET not found in .env. ' +
        'Make sure they are set in the yahoo-fantasy-baseball-mcp/.env file.',
    )
  }

  return { id, secret }
}

function saveTokenCache(cache: TokenCache): void {
  writeFileSync(TOKEN_CACHE_PATH, JSON.stringify(cache, null, 2))
}

async function exchangeCodeForTokens(code: string): Promise<TokenCache> {
  const { id, secret } = getClientCredentials()
  const credentials = Buffer.from(`${id}:${secret}`).toString('base64')

  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: 'oob',
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
          reject(new Error(`HTTP ${res.statusCode}: ${data}`))
          return
        }

        try {
          const response = JSON.parse(data)
          const accessToken = response.access_token
          const refreshToken = response.refresh_token
          const expiresIn = response.expires_in || 3600

          if (!accessToken || !refreshToken) {
            reject(new Error(`Invalid response: ${data}`))
            return
          }

          resolve({
            accessToken,
            refreshToken,
            expiresAt: Date.now() + expiresIn * 1000,
          })
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`))
        }
      })
    })

    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}

async function main() {
  const code = process.argv[2]
  if (!code) {
    console.error('Usage: npx tsx scripts/auth.ts <AUTHORIZATION_CODE>')
    console.error('\nSteps:')
    console.error('1. Get your YAHOO_CLIENT_ID from your .env file')
    console.error('2. Visit: https://api.login.yahoo.com/oauth2/request_auth?client_id=YOUR_CLIENT_ID&redirect_uri=oob&response_type=code')
    console.error('3. Authorize and copy the code')
    console.error('4. Run: npx tsx scripts/auth.ts YOUR_CODE')
    process.exit(1)
  }

  try {
    console.log('[INFO] Exchanging authorization code for tokens...')
    const cache = await exchangeCodeForTokens(code)
    saveTokenCache(cache)

    console.log('[OK] Tokens saved to token-cache.json')
    console.log('\nNow update your GitHub secrets:')
    console.log(`  gh secret set YAHOO_REFRESH_TOKEN --body "${cache.refreshToken}"`)
    console.log('\nOr manually update the YAHOO_REFRESH_TOKEN in your .env:')
    console.log(`  YAHOO_REFRESH_TOKEN=${cache.refreshToken}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ERROR] ${message}`)
    process.exit(1)
  }
}

main()
