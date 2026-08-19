'use client'

import { useEffect, useRef, type KeyboardEvent } from 'react'
import styles from './ConfigNav.module.css'

export const CONFIG_SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'guests', label: 'Invitados' },
  { id: 'design', label: 'Diseño' },
  { id: 'messages', label: 'Mensajes' },
  { id: 'checkin', label: 'Check-in' },
] as const

export type ConfigSectionId = (typeof CONFIG_SECTIONS)[number]['id']

export function configSectionFromHash(hash: string): ConfigSectionId | null {
  const candidate = hash.replace(/^#config-/, '')
  return CONFIG_SECTIONS.some(section => section.id === candidate)
    ? candidate as ConfigSectionId
    : null
}

interface ConfigNavProps {
  activeSection: ConfigSectionId
  onSectionChange: (section: ConfigSectionId) => void
}

export function ConfigNav({ activeSection, onSectionChange }: ConfigNavProps) {
  const trackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const track = trackRef.current
    const activeTab = track?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
    if (!track || !activeTab) return

    const trackRect = track.getBoundingClientRect()
    const tabRect = activeTab.getBoundingClientRect()
    const padding = 12
    let nextScrollLeft = track.scrollLeft

    if (tabRect.left < trackRect.left + padding) {
      nextScrollLeft += tabRect.left - trackRect.left - padding
    } else if (tabRect.right > trackRect.right - padding) {
      nextScrollLeft += tabRect.right - trackRect.right + padding
    } else {
      return
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    track.scrollTo({ left: Math.max(0, nextScrollLeft), behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [activeSection])

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()

    let nextIndex = currentIndex
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + CONFIG_SECTIONS.length) % CONFIG_SECTIONS.length
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % CONFIG_SECTIONS.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = CONFIG_SECTIONS.length - 1

    const nextSection = CONFIG_SECTIONS[nextIndex]
    onSectionChange(nextSection.id)
    trackRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus()
  }

  return (
    <nav className={styles.nav} aria-label="Secciones de configuración">
      <div ref={trackRef} className={styles.track} role="tablist" aria-label="Configuración del evento">
        {CONFIG_SECTIONS.map((section, index) => {
          const active = activeSection === section.id
          return (
            <button
              key={section.id}
              id={`config-tab-${section.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={active ? `config-panel-${section.id}` : undefined}
              tabIndex={active ? 0 : -1}
              className={`${styles.tab} ${active ? styles.active : ''}`}
              onClick={() => onSectionChange(section.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {section.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
