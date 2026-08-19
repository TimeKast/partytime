'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import styles from './SettingsDisclosure.module.css'

interface SettingsDisclosureProps {
  title: string
  summary: string
  children: ReactNode
  defaultOpen?: boolean
  tone?: 'default' | 'warning' | 'success'
  revealKey?: number
}

export function SettingsDisclosure({
  title,
  summary,
  children,
  defaultOpen = false,
  tone = 'default',
  revealKey = 0,
}: SettingsDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = useId()

  useEffect(() => {
    if (revealKey > 0) setOpen(true)
  }, [revealKey])

  return (
    <section className={styles.disclosure} data-tone={tone}>
      <h3 className={styles.heading}>
        <button
          type="button"
          className={styles.trigger}
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen(current => !current)}
        >
          <span className={styles.titleBlock}>
            <strong>{title}</strong>
            <small>{summary}</small>
          </span>
          <span className={styles.chevron} aria-hidden="true">⌄</span>
        </button>
      </h3>
      <div id={contentId} className={styles.content} hidden={!open}>
        {children}
      </div>
    </section>
  )
}
