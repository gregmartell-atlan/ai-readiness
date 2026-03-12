import React, { useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Globe,
  Database,
  Zap,
  BarChart3,
  Snowflake,
} from 'lucide-react'
import type { ScopeNode } from '../../types/assessment'
import './AssetBrowser.css'

const ICON_MAP: Record<string, React.ReactNode> = {
  Globe: <Globe size={16} />,
  Database: <Database size={16} />,
  Zap: <Zap size={16} />,
  BarChart3: <BarChart3 size={16} />,
  Snowflake: <Snowflake size={16} />,
}

interface AssetBrowserProps {
  tree: ScopeNode[]
  selectedId: string
  onSelect: (node: ScopeNode) => void
}

function TreeNode({
  node,
  selectedId,
  onSelect,
  depth = 0,
}: {
  node: ScopeNode
  selectedId: string
  onSelect: (node: ScopeNode) => void
  depth?: number
}) {
  const [expanded, setExpanded] = useState(depth === 0)
  const hasChildren = node.children && node.children.length > 0
  const isSelected = selectedId === node.id

  return (
    <div className="tree-node">
      <button
        className={`tree-node-button ${isSelected ? 'tree-node-selected' : ''}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => {
          onSelect(node)
          if (hasChildren) setExpanded(!expanded)
        }}
      >
        <span className="tree-node-chevron">
          {hasChildren ? (
            expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span style={{ width: 14 }} />
          )}
        </span>
        <span className="tree-node-icon">
          {ICON_MAP[node.icon ?? 'Globe'] ?? <Globe size={16} />}
        </span>
        <span className="tree-node-label">{node.label}</span>
      </button>

      {expanded && hasChildren && (
        <div className="tree-node-children">
          {node.children!.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function AssetBrowser({ tree, selectedId, onSelect }: AssetBrowserProps) {
  return (
    <div className="asset-browser">
      <div className="asset-browser-header">
        <h3 className="asset-browser-title">Scope</h3>
        <span className="asset-browser-subtitle">Select assessment target</span>
      </div>
      <div className="asset-browser-tree">
        {tree.map(node => (
          <TreeNode
            key={node.id}
            node={node}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}
