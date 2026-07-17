'use client'

import styles from './Surfaces.module.css'

export function ToastHost({ message }: { message: string }) {
  if (!message) return null
  const tone = message.startsWith('❌') ? 'danger' : message.startsWith('⚠️') ? 'warning' : 'success'
  return (
    <div className={styles.toastHost}>
      <div
        className={styles.toast}
        data-tone={tone}
        role={tone === 'danger' ? 'alert' : 'status'}
        aria-live={tone === 'danger' ? 'assertive' : 'polite'}
      >
        {message}
      </div>
    </div>
  )
}
