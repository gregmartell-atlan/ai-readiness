import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import express from 'express'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const distDir = path.resolve(projectRoot, 'dist')
const polarisToolPath = path.resolve(projectRoot, 'server/polaris_duckdb.py')

const port = Number(process.env.PORT || 4173)
const backendUrl = (process.env.BACKEND_URL || '').trim()
const atlanBaseUrl = process.env.ATLAN_BASE_URL || ''
const atlanApiKey = process.env.ATLAN_API_KEY || ''
const proxyTimeoutMs = Number(process.env.PROXY_TIMEOUT_MS || 30_000)
const polarisToolTimeoutMs = Number(process.env.POLARIS_TOOL_TIMEOUT_MS || 45_000)
const isProd = process.env.NODE_ENV === 'production'
let viteDevServer = null
const hmrPort = Number(process.env.HMR_PORT || port + 1000)

const polarisRuntime = {
  polaris_client_id: process.env.POLARIS_CLIENT_ID || process.env.MDLH_CLIENT_ID || '',
  polaris_client_secret: process.env.POLARIS_CLIENT_SECRET || process.env.MDLH_CLIENT_SECRET || '',
  polaris_oauth_uri: process.env.POLARIS_OAUTH_URI || process.env.MDLH_OAUTH_URI || '',
  polaris_endpoint: process.env.POLARIS_ENDPOINT || process.env.MDLH_ENDPOINT || '',
  catalog_name: process.env.CATALOG_NAME || 'atlan-wh',
  gold_namespace: process.env.GOLD_NAMESPACE || 'atlan-ns',
  polaris_role_name: process.env.POLARIS_ROLE_NAME || 'ALL',
}

const REQUIRED_POLARIS_FIELDS = [
  'polaris_client_id',
  'polaris_client_secret',
  'polaris_oauth_uri',
  'polaris_endpoint',
  'catalog_name',
  'gold_namespace',
]

const app = express()

function parseLayer(rawValue) {
  const normalized = String(rawValue || 'gold').trim().toLowerCase()
  return normalized === 'bronze' ? 'bronze' : 'gold'
}

function joinUrl(base, pathPart) {
  return `${base.replace(/\/+$/, '')}${pathPart}`
}

function cloneProxyHeaders(req, extra = {}) {
  const headers = { ...req.headers, ...extra }
  delete headers.host
  delete headers.connection
  delete headers['content-length']
  return headers
}

async function forward(req, res, targetUrl, extraHeaders = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), proxyTimeoutMs)

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: cloneProxyHeaders(req, extraHeaders),
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
      duplex: ['GET', 'HEAD'].includes(req.method) ? undefined : 'half',
      signal: controller.signal,
    })

    const excludedHeaders = new Set([
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailers',
      'transfer-encoding',
      'upgrade',
    ])

    response.headers.forEach((value, key) => {
      if (!excludedHeaders.has(key.toLowerCase())) {
        res.setHeader(key, value)
      }
    })

    res.status(response.status)
    if (!response.body) {
      res.end()
      return
    }

    Readable.fromWeb(response.body).pipe(res)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(502).json({
      error: 'Bad gateway',
      detail: message,
      route: req.originalUrl,
      target: targetUrl,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function isPolarisConfigured() {
  return getMissingPolarisFields().length === 0
}

function getMissingPolarisFields() {
  return REQUIRED_POLARIS_FIELDS.filter(key => {
    const value = polarisRuntime[key]
    return typeof value !== 'string' || !value.trim()
  })
}

function mask(value) {
  if (!value) return ''
  if (value.length <= 8) return '••••••••'
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}

async function runPolarisTool(payload) {
  const toolEnv = {
    ...process.env,
    POLARIS_CLIENT_ID: polarisRuntime.polaris_client_id,
    POLARIS_CLIENT_SECRET: polarisRuntime.polaris_client_secret,
    POLARIS_OAUTH_URI: polarisRuntime.polaris_oauth_uri,
    POLARIS_ENDPOINT: polarisRuntime.polaris_endpoint,
    CATALOG_NAME: polarisRuntime.catalog_name,
    GOLD_NAMESPACE: polarisRuntime.gold_namespace,
    POLARIS_ROLE_NAME: polarisRuntime.polaris_role_name,
  }

  return await new Promise((resolve, reject) => {
    const child = spawn('python3', [polarisToolPath], { env: toolEnv })
    let stdout = ''
    let stderr = ''
    let settled = false

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGTERM')
      const forceKill = setTimeout(() => child.kill('SIGKILL'), 500)
      if (typeof forceKill.unref === 'function') forceKill.unref()
      reject(new Error(`Polaris request timed out after ${polarisToolTimeoutMs}ms`))
    }, polarisToolTimeoutMs)

    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.on('error', error => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    })

    child.on('close', code => {
      if (settled) return
      settled = true
      clearTimeout(timeout)

      if (code !== 0) {
        reject(new Error(stderr.trim() || `Polaris tool exited with code ${code}`))
        return
      }

      try {
        const parsed = JSON.parse(stdout)
        resolve(parsed)
      } catch (error) {
        reject(new Error(`Invalid Polaris tool response: ${stdout || String(error)}`))
      }
    })

    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
  })
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    mode: isProd ? 'production' : 'development',
    polaris_configured: isPolarisConfigured(),
    backend_state_proxy_configured: Boolean(backendUrl),
  })
})

app.get('/ready', async (_req, res) => {
  const backendReadyPromise = backendUrl
    ? fetch(joinUrl(backendUrl, '/ready')).then(r => r.ok).catch(() => false)
    : Promise.resolve(null)

  try {
    const [polarisHealth, backendReady] = await Promise.all([
      runPolarisTool({ mode: 'health' }),
      backendReadyPromise,
    ])

    const polarisReady = Boolean(polarisHealth.ok)
    res.status(polarisReady ? 200 : 503).json({
      status: polarisReady ? 'ready' : 'degraded',
      polarisReady,
      backendStateProxyConfigured: Boolean(backendUrl),
      backendReady,
      details: polarisHealth,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(503).json({
      status: 'degraded',
      polarisReady: false,
      backendReady: false,
      error: message,
    })
  }
})

app.use('/api/mdlh/config/polaris', express.json({ limit: '1mb' }))

app.get('/api/mdlh/config/polaris', (_req, res) => {
  const missingFields = getMissingPolarisFields()
  res.json({
    polaris_client_id: mask(polarisRuntime.polaris_client_id),
    polaris_oauth_uri: polarisRuntime.polaris_oauth_uri,
    polaris_endpoint: polarisRuntime.polaris_endpoint,
    catalog_name: polarisRuntime.catalog_name,
    gold_namespace: polarisRuntime.gold_namespace,
    polaris_role_name: polarisRuntime.polaris_role_name,
    is_configured: missingFields.length === 0,
    missing_fields: missingFields,
  })
})

app.put('/api/mdlh/config/polaris', (req, res) => {
  const allowedKeys = [
    'polaris_client_id',
    'polaris_client_secret',
    'polaris_oauth_uri',
    'polaris_endpoint',
    'catalog_name',
    'gold_namespace',
    'polaris_role_name',
  ]

  let updatesApplied = 0
  for (const key of allowedKeys) {
    const value = req.body?.[key]
    if (typeof value === 'string' && value.trim()) {
      polarisRuntime[key] = value.trim()
      updatesApplied += 1
    }
  }

  if (updatesApplied === 0) {
    const missingFields = getMissingPolarisFields()
    res.status(400).json({
      success: false,
      message: 'No credentials provided',
      is_configured: missingFields.length === 0,
      missing_fields: missingFields,
    })
    return
  }

  const missingFields = getMissingPolarisFields()
  res.json({
    success: true,
    message: 'Polaris credentials updated successfully',
    is_configured: missingFields.length === 0,
    missing_fields: missingFields,
  })
})

app.post('/api/mdlh/config/polaris/test', async (_req, res) => {
  if (!isPolarisConfigured()) {
    const missingFields = getMissingPolarisFields()
    res.status(400).json({
      success: false,
      message: `Polaris credentials not configured. Missing: ${missingFields.join(', ')}`,
      is_configured: false,
      missing_fields: missingFields,
    })
    return
  }

  try {
    const result = await runPolarisTool({ mode: 'health' })
    const ok = Boolean(result.ok)
    res.status(ok ? 200 : 502).json({
      success: ok,
      message: ok
        ? `Connected to Polaris catalog '${result.catalog_name || polarisRuntime.catalog_name}'`
        : (result.error || 'Polaris test failed'),
      is_configured: isPolarisConfigured(),
      details: result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(502).json({
      success: false,
      message: `Polaris connection test failed: ${message}`,
      is_configured: isPolarisConfigured(),
    })
  }
})

app.get('/api/mdlh/health', async (_req, res) => {
  const layer = parseLayer(_req.query?.layer)
  try {
    const result = await runPolarisTool({ mode: 'health', layer })
    res.status(result.ok ? 200 : 503).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(503).json({ ok: false, error: message })
  }
})

app.get('/api/mdlh/tables', async (_req, res) => {
  try {
    const result = await runPolarisTool({ mode: 'tables' })
    res.status(result.ok ? 200 : 502).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(502).json({ ok: false, error: message })
  }
})

app.get('/api/mdlh/scopes', async (req, res) => {
  const layer = parseLayer(req.query?.layer)
  try {
    const result = await runPolarisTool({ mode: 'scopes', layer })
    res.status(200).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ ok: false, error: message })
  }
})

app.use('/api/mdlh/query', express.json({ limit: '2mb' }))
app.post('/api/mdlh/query', async (req, res) => {
  const layer = parseLayer(req.body?.layer)
  const query = req.body?.query
  if (typeof query !== 'string' || !query.trim()) {
    res.status(400).json({ ok: false, error: 'Missing query' })
    return
  }

  try {
    const result = await runPolarisTool({
      mode: 'query',
      layer,
      query: query.trim(),
    })
    res.status(200).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ ok: false, error: message })
  }
})

const overviewHandler = async (req, res) => {
  const layer = parseLayer(req.query?.layer)
  const rawAssetTypes = req.query?.assetType
  const assetTypes = Array.isArray(rawAssetTypes)
    ? rawAssetTypes
    : typeof rawAssetTypes === 'string'
      ? rawAssetTypes.split(',').map(v => v.trim()).filter(Boolean)
      : []
  try {
    const scope = {
      connectorName: req.query.connector || '',
      connectionQualifiedName: req.query.connection || '',
      databaseName: req.query.database || '',
      schemaName: req.query.schema || '',
      assetTypes,
    }
    const result = await runPolarisTool({
      mode: 'overview',
      layer,
      scope,
    })
    res.status(200).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ ok: false, error: message })
  }
}

app.get('/api/mdlh/overview', overviewHandler)

app.use('/api/state', (req, res) => {
  if (!backendUrl) {
    res.status(503).json({
      error: 'BACKEND_URL is not configured for /api/state',
      route: req.originalUrl,
    })
    return
  }

  const target = joinUrl(backendUrl, req.originalUrl)
  void forward(req, res, target)
})

app.use('/api/atlan', (req, res) => {
  if (!atlanBaseUrl) {
    res.status(500).json({
      error: 'ATLAN_BASE_URL is not configured',
      route: req.originalUrl,
    })
    return
  }

  const upstreamPath = req.originalUrl.replace(/^\/api\/atlan/, '') || '/'
  const target = joinUrl(atlanBaseUrl, upstreamPath)
  const authHeader = atlanApiKey ? { Authorization: `Bearer ${atlanApiKey}` } : {}
  void forward(req, res, target, authHeader)
})

app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'API route not found',
    route: req.originalUrl,
  })
})

if (isProd) {
  app.use(express.static(distDir))
  app.get('*', async (_req, res, next) => {
    try {
      const html = await fs.readFile(path.resolve(distDir, 'index.html'), 'utf-8')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.send(html)
    } catch (error) {
      next(error)
    }
  })
} else {
  const { createServer } = await import('vite')
  viteDevServer = await createServer({
    root: projectRoot,
    appType: 'custom',
    server: {
      middlewareMode: true,
      host: '127.0.0.1',
      hmr: {
        host: '127.0.0.1',
        port: hmrPort,
        clientPort: hmrPort,
      },
    },
  })

  app.use(viteDevServer.middlewares)

  app.get('*', async (req, res, next) => {
    try {
      const indexPath = path.resolve(projectRoot, 'index.html')
      let template = await fs.readFile(indexPath, 'utf-8')
      template = await viteDevServer.transformIndexHtml(req.originalUrl, template)
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(template)
    } catch (error) {
      viteDevServer.ssrFixStacktrace(error)
      next(error)
    }
  })
}

const httpServer = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[gateway] listening on http://127.0.0.1:${port}`)
  // eslint-disable-next-line no-console
  console.log(`[gateway] polaris configured: ${isPolarisConfigured() ? 'yes' : 'no'}`)
  // eslint-disable-next-line no-console
  console.log(`[gateway] mdlh routes handled locally via ${polarisToolPath}`)
  if (backendUrl) {
    // eslint-disable-next-line no-console
    console.log(`[gateway] /api/state -> ${backendUrl}`)
  } else {
    // eslint-disable-next-line no-console
    console.log('[gateway] /api/state disabled (BACKEND_URL not set)')
  }
})
