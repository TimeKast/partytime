'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.css'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({ variant = 'secondary', size = 'md', className, children, ...props }: ButtonProps) {
  const classes = [styles.btn, styles[variant], styles[size], className].filter(Boolean).join(' ')
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'default' | 'danger' | 'success'
  label: string
  icon: ReactNode
}

export function IconButton({ tone = 'default', label, icon, className, ...props }: IconButtonProps) {
  const toneClass = tone === 'danger' ? styles.iconBtnDanger : tone === 'success' ? styles.iconBtnSuccess : ''
  const classes = [styles.iconBtn, toneClass, className].filter(Boolean).join(' ')
  return (
    <button className={classes} title={label} aria-label={label} {...props}>
      {icon}
    </button>
  )
}
