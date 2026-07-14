'use client'

import * as React from 'react'
import {
    parseStrictHexColor,
    resolveBackgroundImagePosition,
    type EventPresentation,
    type PresentationMode,
} from '@/lib/event-presentation'
import styles from '../admin.module.css'

interface EventPresentationSettingsProps {
    value: EventPresentation
    onChange: (value: EventPresentation) => void
    backgroundColor: string
    backgroundImageUrl: string
    onBackgroundColorChange: (value: string) => void
}

interface EyeDropperSelection {
    sRGBHex: string
}

interface EyeDropperInstance {
    open: () => Promise<EyeDropperSelection>
}

type EyeDropperConstructor = new () => EyeDropperInstance
type PickerState = 'idle' | 'selecting' | 'cancelled' | 'error'

export function classifyEyeDropperError(error: unknown): Exclude<PickerState, 'idle' | 'selecting'> {
    return error && typeof error === 'object' && 'name' in error && error.name === 'AbortError'
        ? 'cancelled'
        : 'error'
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

export default function EventPresentationSettings({
    value,
    onChange,
    backgroundColor,
    backgroundImageUrl,
    onBackgroundColorChange,
}: EventPresentationSettingsProps) {
    const [hexInput, setHexInput] = React.useState(backgroundColor)
    const [pickerSupported, setPickerSupported] = React.useState<boolean | null>(null)
    const [pickerState, setPickerState] = React.useState<PickerState>('idle')
    const parsedHexInput = parseStrictHexColor(hexInput)

    React.useEffect(() => {
        setHexInput(backgroundColor)
    }, [backgroundColor])

    React.useEffect(() => {
        const EyeDropperCtor = (
            window as typeof window & { EyeDropper?: EyeDropperConstructor }
        ).EyeDropper
        setPickerSupported(window.isSecureContext && Boolean(EyeDropperCtor))
    }, [])

    const update = <K extends keyof EventPresentation>(key: K, nextValue: EventPresentation[K]) => {
        onChange({ ...value, [key]: nextValue })
    }

    const applyBackgroundColor = (nextColor: string) => {
        const parsedColor = parseStrictHexColor(nextColor)
        if (!parsedColor) return
        setHexInput(parsedColor)
        onBackgroundColorChange(parsedColor)
    }

    const openEyeDropper = async () => {
        const EyeDropperCtor = (
            window as typeof window & { EyeDropper?: EyeDropperConstructor }
        ).EyeDropper
        if (!window.isSecureContext || !EyeDropperCtor) {
            setPickerSupported(false)
            return
        }

        try {
            // Opening remains directly inside the click activation. Do not move
            // this behind another promise or attempt to read image pixels.
            const selection = new EyeDropperCtor().open()
            setPickerState('selecting')
            const { sRGBHex } = await selection
            applyBackgroundColor(sRGBHex)
            setPickerState('idle')
        } catch (error) {
            setPickerState(classifyEyeDropperError(error))
        }
    }

    const pickerMessage = pickerState === 'selecting'
        ? 'Haz clic en un color de la imagen'
        : pickerState === 'cancelled'
            ? 'Selección cancelada. Conservamos el color anterior'
            : pickerState === 'error'
                ? 'No pudimos abrir el cuentagotas. Usa el selector o escribe un HEX'
                : ''

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

            {value.presentationMode === 'artwork_only' && value.backgroundImageFit === 'contain' && (
                <div className={styles.configFormGroup}>
                    <label className={styles.configLabel} htmlFor="backgroundImagePosition">
                        Alineación de la imagen completa
                    </label>
                    <select
                        id="backgroundImagePosition"
                        className={styles.configInput}
                        value={value.backgroundImagePosition}
                        onChange={event => update(
                            'backgroundImagePosition',
                            event.target.value === 'top' ? 'top' : 'center',
                        )}
                    >
                        <option value="center">Centrada (comportamiento actual)</option>
                        <option value="top">Arriba</option>
                    </select>
                    <p className={styles.configHelper}>
                        Usa “Arriba” si el CTA cubre contenido importante en la parte inferior del arte.
                    </p>
                </div>
            )}

            <div className={`${styles.containBackgroundPanel} ${value.backgroundImageFit === 'cover' ? styles.coverPreviewOnly : ''}`}>
                {value.backgroundImageFit === 'contain' && (
                    <div className={styles.configFormGroup}>
                        <label className={styles.configLabel} htmlFor="containBackgroundColor">
                            Color de relleno
                        </label>
                        <p id="contain-background-help" className={styles.configHelper}>
                            Se muestra en las áreas libres cuando la imagen completa no llena la pantalla.
                        </p>

                        <div className={styles.colorControlRow}>
                            <input
                                id="containBackgroundColor"
                                type="color"
                                className={styles.colorPickerInput}
                                value={parseStrictHexColor(backgroundColor) ?? '#1a0033'}
                                onChange={event => applyBackgroundColor(event.target.value)}
                                aria-label="Seleccionar color de relleno"
                            />
                            <input
                                type="text"
                                className={styles.colorHexInput}
                                value={hexInput}
                                onChange={event => {
                                    const nextValue = event.target.value
                                    setHexInput(nextValue)
                                    const parsedColor = parseStrictHexColor(nextValue)
                                    if (parsedColor) onBackgroundColorChange(parsedColor)
                                }}
                                pattern="^#[0-9A-Fa-f]{6}$"
                                maxLength={7}
                                spellCheck={false}
                                autoCapitalize="off"
                                aria-label="Color de relleno en formato HEX"
                                aria-describedby="contain-background-help contain-background-error"
                                aria-invalid={!parsedHexInput}
                                required
                            />
                            {pickerSupported && (
                                <button
                                    type="button"
                                    className={styles.eyeDropperButton}
                                    onClick={openEyeDropper}
                                    disabled={pickerState === 'selecting'}
                                >
                                    <span aria-hidden="true">◉</span>
                                    {pickerState === 'selecting' ? 'Seleccionando color…' : 'Tomar color de la imagen'}
                                </button>
                            )}
                        </div>

                        {!parsedHexInput && (
                            <p id="contain-background-error" className={styles.colorError}>
                                Escribe un color HEX válido de 6 dígitos, por ejemplo #120b18.
                            </p>
                        )}
                        {pickerSupported === false && (
                            <p className={styles.pickerFallback}>
                                Usa el selector de color o escribe un HEX.
                            </p>
                        )}
                        <p className={styles.pickerStatus} aria-live="polite">
                            {pickerMessage}
                        </p>
                    </div>
                )}

                <figure className={styles.mobilePreview}>
                    <figcaption>Previsualización móvil 9:16</figcaption>
                    <div
                        className={styles.mobilePreviewFrame}
                        style={{ backgroundColor: parseStrictHexColor(backgroundColor) ?? '#1a0033' }}
                    >
                        {backgroundImageUrl && (
                            <img
                                src={backgroundImageUrl}
                                alt="Previsualización de la imagen de fondo"
                                style={{
                                    objectFit: value.backgroundImageFit,
                                    objectPosition: resolveBackgroundImagePosition(value),
                                }}
                            />
                        )}
                    </div>
                </figure>
            </div>
        </section>
    )
}
