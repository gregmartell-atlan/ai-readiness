import React from 'react'
import type { MaturityBand } from '../../types/scoring'
import { getMaturityConfig } from '../../engine/scoringEngine'

interface MaturityBadgeProps {
  band: MaturityBand
  size?: 'sm' | 'md' | 'lg'
}

export default function MaturityBadge({ band, size = 'sm' }: MaturityBadgeProps) {
  const mc = getMaturityConfig(band)

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-0.5',
    lg: 'text-sm px-3 py-1',
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-semibold ${sizeClasses[size]}`}
      style={{
        backgroundColor: mc.bgColor,
        color: mc.color,
      }}
    >
      <span>{mc.emoji}</span>
      <span>{mc.label}</span>
    </span>
  )
}
