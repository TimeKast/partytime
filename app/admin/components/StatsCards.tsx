'use client'

import styles from '../admin.module.css'

interface StatsCardsProps {
    stats: {
        total: number
        confirmed: number
        cancelled: number
        plusOne: number
        totalGuests: number
        emailsSent: number
    }
}

/**
 * H-008 FIX: Extracted StatsCards component from monolithic admin page
 * Displays event statistics in card format
 */
export default function StatsCards({ stats }: StatsCardsProps) {
    return (
        <div className={styles.stats}>
            <div className={styles.statCard}>
                <h3>{stats.totalGuests}</h3>
                <p>👥 Invitados</p>
            </div>
            <div className={styles.statCard}>
                <h3>{stats.total}</h3>
                <p>📋 RSVPs</p>
            </div>
            <div className={styles.statCard}>
                <h3>{stats.confirmed}</h3>
                <p>✅ Confirmados</p>
            </div>
            <div className={styles.statCard}>
                <h3>{stats.plusOne}</h3>
                <p>➕ Con +1</p>
            </div>
            <div className={styles.statCard}>
                <h3>{stats.cancelled}</h3>
                <p>❌ Cancelados</p>
            </div>
            <div className={styles.statCard}>
                <h3>{stats.emailsSent}</h3>
                <p>✉️ Emails</p>
            </div>
        </div>
    )
}
