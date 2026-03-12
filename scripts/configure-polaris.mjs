const gatewayUrl = process.env.GATEWAY_URL || 'http://127.0.0.1:4173'

const payload = {
  polaris_client_id: process.env.POLARIS_CLIENT_ID || '',
  polaris_client_secret: process.env.POLARIS_CLIENT_SECRET || '',
  polaris_oauth_uri: process.env.POLARIS_OAUTH_URI || '',
  polaris_endpoint: process.env.POLARIS_ENDPOINT || '',
  catalog_name: process.env.CATALOG_NAME || 'atlan-wh',
  gold_namespace: process.env.GOLD_NAMESPACE || 'atlan-ns',
  polaris_role_name: process.env.POLARIS_ROLE_NAME || 'ALL',
}

const missing = Object.entries(payload)
  .filter(([key, value]) => key !== 'catalog_name' && !value)
  .map(([key]) => key)

if (missing.length > 0) {
  // eslint-disable-next-line no-console
  console.error(`Missing required env vars: ${missing.join(', ')}`)
  process.exit(1)
}

async function jsonFetch(url, init) {
  const response = await fetch(url, init)
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  return { ok: response.ok, status: response.status, body }
}

async function run() {
  const updateResp = await jsonFetch(`${gatewayUrl}/api/mdlh/config/polaris`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!updateResp.ok) {
    // eslint-disable-next-line no-console
    console.error('Polaris config update failed:', updateResp.status, updateResp.body)
    process.exit(1)
  }

  // eslint-disable-next-line no-console
  console.log('Polaris config updated:', updateResp.body)

  const testResp = await jsonFetch(`${gatewayUrl}/api/mdlh/config/polaris/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!testResp.ok) {
    // eslint-disable-next-line no-console
    console.error('Polaris test failed:', testResp.status, testResp.body)
    process.exit(1)
  }

  // eslint-disable-next-line no-console
  console.log('Polaris test result:', testResp.body)
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected error:', error instanceof Error ? error.message : error)
  process.exit(1)
})
