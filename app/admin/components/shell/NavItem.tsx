'use client'

import type { ReactNode } from 'react'
import styles from './NavItem.module.css'

interface NavItemProps {
  icon: ReactNode
  label: string
  active?: boolean
  collapsed?: boolean
  onClick: () => void
}

export function NavItem({ icon, label, active = false, collapsed = false, onClick }: NavItemProps) {
  const classes = [styles.item, active ? styles.active : '', collapsed ? styles.collapsed : ''].filter(Boolean).join(' ')
  return (
    <button type="button" className={classes} onClick={onClick} title={collapsed ? label : undefined} aria-current={active ? 'page' : undefined}>
      <span className={styles.icon}>{icon}</span>
      <span className={styles.label}>{label}</span>
    </button>
  )
}
