'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './ConfigNav.module.css'

const SECTIONS = [
  { id: 'config-basic', label: 'Información básica' },
  { id: 'config-capacity', label: 'Precio y capacidad' },
  { id: 'config-presentation', label: 'Presentación' },
  { id: 'config-images', label: 'Imágenes' },
  { id: 'config-colors', label: 'Colores' },
  { id: 'config-email', label: 'Emails' },
]

export function ConfigNav() {
  const navRef = useRef<HTMLElement>(null)
  const frameRef = useRef<number>()
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id)

  const getStickyOffset = useCallback(() => {
    const nav = navRef.current
    if (!nav) return 0

    const stickyTop = Number.parseFloat(window.getComputedStyle(nav).top) || 0
    return Math.ceil(stickyTop + nav.offsetHeight + 8)
  }, [])

  const updateActiveSection = useCallback(() => {
    const targets = SECTIONS
      .map(section => document.getElementById(section.id))
      .filter((target): target is HTMLElement => target !== null)

    if (targets.length === 0) return

    const marker = getStickyOffset() + 1
    const atDocumentEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
    let currentId = targets[0].id

    if (atDocumentEnd) {
      currentId = targets[targets.length - 1].id
    } else {
      for (const target of targets) {
        if (target.getBoundingClientRect().top <= marker) {
          currentId = target.id
        } else {
          break
        }
      }
    }

    setActiveSection(currentId)
  }, [getStickyOffset])

  const scheduleActiveSectionUpdate = useCallback(() => {
    if (frameRef.current !== undefined) return

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = undefined
      updateActiveSection()
    })
  }, [updateActiveSection])

  useEffect(() => {
    const targets = SECTIONS
      .map(section => document.getElementById(section.id))
      .filter((target): target is HTMLElement => target !== null)

    const observer = new IntersectionObserver(scheduleActiveSectionUpdate, {
      rootMargin: `-${getStickyOffset()}px 0px -45% 0px`,
      threshold: [0, 0.01, 0.5, 1],
    })

    targets.forEach(target => observer.observe(target))
    window.addEventListener('scroll', scheduleActiveSectionUpdate, { passive: true })
    window.addEventListener('resize', scheduleActiveSectionUpdate)
    scheduleActiveSectionUpdate()

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', scheduleActiveSectionUpdate)
      window.removeEventListener('resize', scheduleActiveSectionUpdate)
      if (frameRef.current !== undefined) {
        window.cancelAnimationFrame(frameRef.current)
      }
    }
  }, [getStickyOffset, scheduleActiveSectionUpdate])

  const handleShortcutClick = (event: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    const target = document.getElementById(sectionId)
    if (!target) return

    event.preventDefault()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const targetTop = target.getBoundingClientRect().top + window.scrollY - getStickyOffset()

    window.history.pushState(null, '', `#${sectionId}`)
    window.scrollTo({
      top: Math.max(0, targetTop),
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
    setActiveSection(sectionId)
  }

  return (
    <nav ref={navRef} className={styles.nav} aria-label="Secciones de configuración">
      {SECTIONS.map(section => (
        <a
          key={section.id}
          className={`${styles.link} ${activeSection === section.id ? styles.active : ''}`}
          href={`#${section.id}`}
          aria-current={activeSection === section.id ? 'location' : undefined}
          onClick={(event) => handleShortcutClick(event, section.id)}
        >
          {section.label}
        </a>
      ))}
    </nav>
  )
}
