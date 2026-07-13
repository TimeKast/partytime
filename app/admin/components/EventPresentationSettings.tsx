import type { EventPresentation, PresentationMode } from '@/lib/event-presentation'
import styles from '../admin.module.css'

interface EventPresentationSettingsProps {
    value: EventPresentation
    onChange: (value: EventPresentation) => void
}

const MODES: Array<{ value: PresentationMode; label: string; description: string }> = [
    {
        value: 'classic',
        label: 'Clásica (compatibilidad)',
        description: 'Conserva la invitación original para eventos existentes.',
    },
    {
        value: 'modern_details',
        label: 'Moderna con información',
        description: 'Muestra solo el título y los datos que tengan contenido.',
    },
    {
        value: 'artwork_only',
        label: 'Solo imagen + RSVP',
        description: 'Oculta la información pública y deja únicamente el estado o botón RSVP.',
    },
]

export default function EventPresentationSettings({ value, onChange }: EventPresentationSettingsProps) {
    const update = <K extends keyof EventPresentation>(key: K, nextValue: EventPresentation[K]) => {
        onChange({ ...value, [key]: nextValue })
    }

    return (
        <section className={styles.configSection} aria-labelledby="public-presentation-title">
            <h3 id="public-presentation-title" className={styles.configSectionTitle}>Presentación pública</h3>
            <p className={styles.presentationIntro}>
                Elige cómo se verá la invitación. Los datos del evento siguen disponibles para administración,
                emails y exportaciones aunque uses “Solo imagen + RSVP”.
            </p>

            <fieldset className={styles.presentationModes}>
                <legend className={styles.visuallyHidden}>Modo de presentación</legend>
                {MODES.map(mode => (
                    <label key={mode.value} className={styles.presentationModeOption}>
                        <input
                            type="radio"
                            name="presentationMode"
                            value={mode.value}
                            checked={value.presentationMode === mode.value}
                            onChange={() => update('presentationMode', mode.value)}
                        />
                        <span>
                            <strong>{mode.label}</strong>
                            <small>{mode.description}</small>
                        </span>
                    </label>
                ))}
            </fieldset>

            <div className={styles.configFormGroup}>
                <label className={styles.configLabel} htmlFor="rsvpTitle">Texto sobre el botón (opcional)</label>
                <input
                    id="rsvpTitle"
                    type="text"
                    className={styles.configInput}
                    value={value.rsvpTitle}
                    onChange={event => update('rsvpTitle', event.target.value)}
                />
                <p className={styles.configHelper}>Déjalo vacío para ocultar el encabezado.</p>
            </div>

            <div className={styles.configFormGroup}>
                <label className={styles.configLabel} htmlFor="rsvpButtonLabel">Texto del botón RSVP *</label>
                <input
                    id="rsvpButtonLabel"
                    type="text"
                    className={styles.configInput}
                    value={value.rsvpButtonLabel}
                    onChange={event => update('rsvpButtonLabel', event.target.value)}
                    minLength={1}
                    maxLength={80}
                    required
                />
            </div>

            <div className={styles.configFormGroup}>
                <label className={styles.configLabel} htmlFor="backgroundOverlayStrength">
                    Oscurecimiento del fondo: {value.backgroundOverlayStrength}%
                </label>
                <input
                    id="backgroundOverlayStrength"
                    type="range"
                    className={styles.presentationRange}
                    min={0}
                    max={80}
                    step={5}
                    value={value.backgroundOverlayStrength}
                    onChange={event => update('backgroundOverlayStrength', Number(event.target.value))}
                />
            </div>

            <div className={styles.configFormGroup}>
                <label className={styles.configLabel} htmlFor="backgroundImageFit">Ajuste de la imagen</label>
                <select
                    id="backgroundImageFit"
                    className={styles.configInput}
                    value={value.backgroundImageFit}
                    onChange={event => update('backgroundImageFit', event.target.value === 'contain' ? 'contain' : 'cover')}
                >
                    <option value="cover">Cubrir pantalla</option>
                    <option value="contain">Mostrar imagen completa</option>
                </select>
                {value.presentationMode === 'artwork_only' && value.backgroundImageFit === 'cover' && (
                    <p className={styles.presentationRecommendation}>
                        Si el arte contiene texto cerca de los bordes, usa “Mostrar imagen completa” para evitar recortes en celular.
                    </p>
                )}
            </div>
        </section>
    )
}
