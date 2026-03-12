import React from 'react'
import {
  ASSET_TYPE_OPTIONS,
  getDefaultAssetTypes,
} from '../../data/signalDefinitions'
import './AssetTypeFilter.css'

interface AssetTypeFilterProps {
  selectedTypes: string[]
  onChange: (types: string[]) => void
}

export default function AssetTypeFilter({
  selectedTypes,
  onChange,
}: AssetTypeFilterProps) {
  const toggleType = (typeName: string) => {
    const current = new Set(selectedTypes)
    if (current.has(typeName)) {
      current.delete(typeName)
    } else {
      current.add(typeName)
    }

    const next = Array.from(current)
    if (next.length === 0) {
      onChange(getDefaultAssetTypes())
      return
    }
    onChange(next)
  }

  const resetDefaults = () => onChange(getDefaultAssetTypes())

  return (
    <div className="asset-type-filter">
      <div className="asset-type-filter-header">
        <h3 className="asset-type-filter-title">Asset Types</h3>
        <button
          type="button"
          className="asset-type-filter-reset"
          onClick={resetDefaults}
        >
          Reset
        </button>
      </div>
      <div className="asset-type-filter-list">
        {ASSET_TYPE_OPTIONS.map(option => {
          const checked = selectedTypes.includes(option.typeName)
          return (
            <label key={option.typeName} className="asset-type-filter-item">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleType(option.typeName)}
              />
              <span>{option.label}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
