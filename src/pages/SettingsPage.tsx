import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import {
  getPolarisConfig,
  testPolarisConnection,
  updatePolarisConfig,
  type PolarisConfigUpdate,
} from '../services/mdlh/qualityApi'

type FlashKind = 'ok' | 'error' | 'info'

interface FlashMessage {
  kind: FlashKind
  text: string
}

interface PolarisFormState {
  polaris_client_id: string
  polaris_client_secret: string
  polaris_oauth_uri: string
  polaris_endpoint: string
  catalog_name: string
  gold_namespace: string
  polaris_role_name: string
}

const EMPTY_FORM: PolarisFormState = {
  polaris_client_id: '',
  polaris_client_secret: '',
  polaris_oauth_uri: '',
  polaris_endpoint: '',
  catalog_name: 'atlan-wh',
  gold_namespace: 'atlan-ns',
  polaris_role_name: 'ALL',
}

function clean(value: string): string {
  return value.trim()
}

export default function SettingsPage() {
  const [form, setForm] = useState<PolarisFormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [isConfigured, setIsConfigured] = useState(false)
  const [missingFields, setMissingFields] = useState<string[]>([])
  const [maskedClientId, setMaskedClientId] = useState('')
  const [flash, setFlash] = useState<FlashMessage | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setFlash(null)
      try {
        const cfg = await getPolarisConfig()
        if (!active) return

        const clientId = cfg.polaris_client_id || ''
        const looksMasked = clientId.includes('•') || clientId.includes('*')

        setForm({
          polaris_client_id: looksMasked ? '' : clientId,
          polaris_client_secret: '',
          polaris_oauth_uri: cfg.polaris_oauth_uri || '',
          polaris_endpoint: cfg.polaris_endpoint || '',
          catalog_name: cfg.catalog_name || 'atlan-wh',
          gold_namespace: cfg.gold_namespace || 'atlan-ns',
          polaris_role_name: cfg.polaris_role_name || 'ALL',
        })
        setMaskedClientId(looksMasked ? clientId : '')
        setIsConfigured(Boolean(cfg.is_configured))
        setMissingFields(cfg.missing_fields ?? [])
      } catch (error) {
        if (!active) return
        const message = error instanceof Error ? error.message : 'Failed to load Polaris configuration'
        setFlash({ kind: 'error', text: message })
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  const canSave = useMemo(() => {
    return (
      Boolean(clean(form.polaris_client_id)) ||
      Boolean(clean(form.polaris_client_secret)) ||
      Boolean(clean(form.polaris_oauth_uri)) ||
      Boolean(clean(form.polaris_endpoint)) ||
      Boolean(clean(form.catalog_name)) ||
      Boolean(clean(form.gold_namespace)) ||
      Boolean(clean(form.polaris_role_name))
    )
  }, [form])

  function onFieldChange<K extends keyof PolarisFormState>(field: K, value: PolarisFormState[K]) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function buildUpdatePayload(): PolarisConfigUpdate {
    const payload: PolarisConfigUpdate = {}

    if (clean(form.polaris_client_id)) payload.polaris_client_id = clean(form.polaris_client_id)
    if (clean(form.polaris_client_secret)) payload.polaris_client_secret = clean(form.polaris_client_secret)
    if (clean(form.polaris_oauth_uri)) payload.polaris_oauth_uri = clean(form.polaris_oauth_uri)
    if (clean(form.polaris_endpoint)) payload.polaris_endpoint = clean(form.polaris_endpoint)
    if (clean(form.catalog_name)) payload.catalog_name = clean(form.catalog_name)
    if (clean(form.gold_namespace)) payload.gold_namespace = clean(form.gold_namespace)
    if (clean(form.polaris_role_name)) payload.polaris_role_name = clean(form.polaris_role_name)

    return payload
  }

  async function handleSave() {
    if (!isConfigured && !clean(form.polaris_client_secret)) {
      setFlash({ kind: 'error', text: 'OAuth Client Secret is required for initial Polaris setup.' })
      return
    }

    const payload = buildUpdatePayload()
    if (Object.keys(payload).length === 0) {
      setFlash({ kind: 'error', text: 'Add at least one setting value before saving.' })
      return
    }

    setSaving(true)
    setFlash(null)
    try {
      const result = await updatePolarisConfig(payload)
      setIsConfigured(result.is_configured)
      setMissingFields(result.missing_fields ?? [])
      setFlash({ kind: result.success ? 'ok' : 'error', text: result.message })
      setForm(prev => ({ ...prev, polaris_client_secret: '' }))
      if (payload.polaris_client_id) {
        const current = payload.polaris_client_id
        setMaskedClientId(current.length > 8 ? `${current.slice(0, 4)}••••${current.slice(-4)}` : '••••••••')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update Polaris configuration'
      setFlash({ kind: 'error', text: message })
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setFlash(null)
    try {
      const result = await testPolarisConnection()
      setIsConfigured(result.is_configured)
      setMissingFields(result.missing_fields ?? [])
      setFlash({ kind: result.success ? 'ok' : 'error', text: result.message })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection test failed'
      setFlash({ kind: 'error', text: message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="min-h-screen bg-atlan-bg text-atlan-text p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">Polaris Settings</h1>
            <p className="text-sm text-atlan-textSecondary mt-1">
              Configure local backend access to Polaris REST catalog.
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-atlan-border text-atlan-textSecondary hover:text-atlan-text hover:border-atlan-primary/70 hover:bg-atlan-primaryMuted transition-colors text-sm"
          >
            <ArrowLeft size={15} />
            Back to Assessment
          </Link>
        </div>

        <div className="bg-atlan-surface border border-atlan-border rounded-xl p-4 md:p-6 space-y-4 shadow-rc">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-atlan-textSecondary">
              Status:{' '}
              <span className={isConfigured ? 'text-atlan-success' : 'text-atlan-warning'}>
                {isConfigured ? 'Configured' : 'Not configured'}
              </span>
            </div>
            {maskedClientId && (
              <div className="text-xs text-atlan-textMuted font-mono">
                Current Client ID: {maskedClientId}
              </div>
            )}
          </div>

          {flash && (
            <div
              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                flash.kind === 'ok'
                  ? 'border-atlan-success/40 bg-atlan-successBg text-atlan-success'
                  : flash.kind === 'error'
                    ? 'border-atlan-danger/40 bg-atlan-dangerBg text-atlan-danger'
                    : 'border-atlan-border bg-atlan-bg text-atlan-textSecondary'
              }`}
            >
              {flash.kind === 'ok' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              <span>{flash.text}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-atlan-textSecondary">OAuth Client ID</span>
              <input
                value={form.polaris_client_id}
                onChange={e => onFieldChange('polaris_client_id', e.target.value)}
                placeholder={maskedClientId ? 'Leave blank to keep current value' : 'Enter client ID'}
                autoComplete="off"
                className="bg-atlan-bg border border-atlan-border rounded-md px-3 py-2 outline-none focus:border-atlan-primary text-atlan-text placeholder:text-atlan-textMuted"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-atlan-textSecondary">OAuth Client Secret</span>
              <input
                type="password"
                value={form.polaris_client_secret}
                onChange={e => onFieldChange('polaris_client_secret', e.target.value)}
                placeholder="Enter new secret to rotate"
                autoComplete="new-password"
                className="bg-atlan-bg border border-atlan-border rounded-md px-3 py-2 outline-none focus:border-atlan-primary text-atlan-text placeholder:text-atlan-textMuted"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="text-atlan-textSecondary">OAuth Token URL</span>
              <input
                value={form.polaris_oauth_uri}
                onChange={e => onFieldChange('polaris_oauth_uri', e.target.value)}
                placeholder="https://tenant.atlan.com/api/polaris/api/catalog/v1/oauth/tokens"
                className="bg-atlan-bg border border-atlan-border rounded-md px-3 py-2 outline-none focus:border-atlan-primary text-atlan-text placeholder:text-atlan-textMuted"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="text-atlan-textSecondary">Catalog URI</span>
              <input
                value={form.polaris_endpoint}
                onChange={e => onFieldChange('polaris_endpoint', e.target.value)}
                placeholder="https://tenant.atlan.com/api/polaris/api/catalog"
                className="bg-atlan-bg border border-atlan-border rounded-md px-3 py-2 outline-none focus:border-atlan-primary text-atlan-text placeholder:text-atlan-textMuted"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-atlan-textSecondary">Catalog Name</span>
              <input
                value={form.catalog_name}
                onChange={e => onFieldChange('catalog_name', e.target.value)}
                placeholder="atlan-wh"
                className="bg-atlan-bg border border-atlan-border rounded-md px-3 py-2 outline-none focus:border-atlan-primary text-atlan-text placeholder:text-atlan-textMuted"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-atlan-textSecondary">Namespace</span>
              <input
                value={form.gold_namespace}
                onChange={e => onFieldChange('gold_namespace', e.target.value)}
                placeholder="atlan-ns"
                className="bg-atlan-bg border border-atlan-border rounded-md px-3 py-2 outline-none focus:border-atlan-primary text-atlan-text placeholder:text-atlan-textMuted"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-atlan-textSecondary">Role Name</span>
              <input
                value={form.polaris_role_name}
                onChange={e => onFieldChange('polaris_role_name', e.target.value)}
                placeholder="lake_readers"
                className="bg-atlan-bg border border-atlan-border rounded-md px-3 py-2 outline-none focus:border-atlan-primary text-atlan-text placeholder:text-atlan-textMuted"
              />
            </label>
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-2">
            <button
              onClick={handleSave}
              disabled={loading || saving || !canSave}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-atlan-primary hover:bg-atlan-primaryHover disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium shadow-btn"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Save Settings
            </button>
            <button
              onClick={handleTest}
              disabled={loading || testing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-atlan-border text-atlan-textSecondary hover:text-atlan-text hover:border-atlan-primary/70 hover:bg-atlan-primaryMuted disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : null}
              Test Connection
            </button>
          </div>

          {!isConfigured && missingFields.length > 0 && (
            <div className="text-xs text-atlan-warning">
              Missing required fields: {missingFields.join(', ')}
            </div>
          )}

          {loading && (
            <div className="text-sm text-atlan-textMuted">Loading current configuration...</div>
          )}
        </div>
      </div>
    </div>
  )
}
