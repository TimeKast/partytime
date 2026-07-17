'use client'

import styles from './ImagePreview.module.css'

interface ImagePreviewProps {
  src: string
  alt: string
  aspectRatio: string
  dimensionsLabel?: string
}

/**
 * Bounded preview frame. Fixes the pre-redesign bug where the OG image
 * preview rendered at intrinsic image size because its CSS class was never
 * defined, instead of rendering inside a contained box.
 */
export function ImagePreview({ src, alt, aspectRatio, dimensionsLabel }: ImagePreviewProps) {
  return (
    <div className={styles.frame} style={{ aspectRatio }}>
      <img src={src} alt={alt} />
      {dimensionsLabel && <span className={styles.dimensions}>{dimensionsLabel}</span>}
    </div>
  )
}
