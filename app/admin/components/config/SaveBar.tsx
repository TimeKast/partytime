'use client'

import styles from './SaveBar.module.css'
import { Button } from '../ui/Button'

interface SaveBarProps {
  saving: boolean
  statusLabel?: string
}

export function SaveBar({ saving, statusLabel }: SaveBarProps) {
  return (
    <div className={styles.bar}>
      {statusLabel && <span className={styles.status}>{statusLabel}</span>}
      <Button type="submit" variant="primary" disabled={saving}>
        {saving ? 'Guardando...' : 'Guardar Configuración'}
      </Button>
    </div>
  )
}
