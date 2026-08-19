'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PhoneInput } from 'react-international-phone'
import 'react-international-phone/style.css'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import eventConfig from '@/event-config.json'
import styles from './admin.module.css'
import type { Event } from '@/types/event'
import {
  normalizeEventPresentation,
  parseStrictHexColor,
  type BackgroundImageFit,
  type BackgroundImagePosition,
  type PresentationMode,
} from '@/lib/event-presentation'
import { buildEventExportMetadataRows, createEventExportFilename } from '@/lib/event-export'
import {
  buildRsvpListView,
  computeCheckinArrivalCount,
  describeCheckinArrivals,
  describePaymentsCollected,
  describeRsvpListView,
  filterAndSortRsvps,
  formatAmountsCollected,
  formatCentsAsCurrency,
  rsvpPaymentStatusLabel,
  rsvpStatusLabel,
  type RsvpEmailFilter,
  type RsvpPageSize,
  type RsvpPaymentFilter,
  type RsvpPlusOneFilter,
  type RsvpSort,
  type RsvpStatusFilter,
} from '@/lib/rsvp-list'
// H-008 FIX: Import extracted components to reduce monolithic file size
import {
  ChangePasswordForm,
  CheckinSettings,
  EventPresentationSettings,
  ForcedPasswordChangeDialog,
  InvitationLinkManager,
  StatsCards,
  UserManagement,
  ReminderStatusSection,
  type RSVP,
} from './components'
import CheckinOverview from './components/CheckinOverview'
import { parseCheckinStatusPayload, type CheckinStatus } from './components/CheckinStatus'
import { AdminShell } from './components/shell'
import { RsvpFilters, RsvpPagination, RsvpTable } from './components/table'
import { Button, ImagePreview } from './components/ui'
import { ExternalLink, Settings } from './components/ui/icons'
import {
  ConfigNav,
  configSectionFromHash,
  type ConfigSectionId,
} from './components/config/ConfigNav'
import { SaveBar } from './components/config/SaveBar'
import { SettingsDisclosure } from './components/config/SettingsDisclosure'
import { BackstageStatusStrip } from './components/config/BackstageStatusStrip'
import {
  isPlusOneLockedForPayment,
  plusOnePaymentLockMessage,
} from './components/config/rsvp-edit-policy'

type ConfigDisclosureId = 'identity' | 'payment' | 'capacity' | 'presentation' | 'reminder'

export default function AdminDashboard() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [currentUser, setCurrentUser] = useState<{
    id: string
    email: string
    name: string
    role: string
    mustChangePassword: boolean
  } | null>(null)
  const [rsvps, setRsvps] = useState<RSVP[]>([])
  const [emailTargetRsvps, setEmailTargetRsvps] = useState<RSVP[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  // Estado para tabs
  const [activeTab, setActiveTab] = useState<'dashboard' | 'config' | 'eventos' | 'usuarios' | 'cuenta'>('dashboard')
  const [activeConfigSection, setActiveConfigSection] = useState<ConfigSectionId>('general')
  const [configValidationReveal, setConfigValidationReveal] = useState<{
    id: ConfigDisclosureId | null
    nonce: number
  }>({ id: null, nonce: 0 })

  // Estado para multi-party
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string>('') // Will be set from homeEventId
  const [homeEventId, setHomeEventId] = useState<string>('')
  const selectedEvent = events.find(event => event.slug === selectedEventId)
  const accessRole = selectedEvent?.accessRole
  const canManageSelectedEvent = currentUser?.role === 'super_admin' || accessRole === 'manager'
  const isReadOnly = !canManageSelectedEvent
  // ISSUE-010: whether STRIPE_SECRET_KEY is set server-side (never the key
  // itself — see GET /api/event-settings). Drives the "Stripe no configurado"
  // notice next to the payment toggle.
  const [stripeConfigured, setStripeConfigured] = useState(true)
  // ISSUE-018: loaded at page level so Dashboard and viewer accounts receive
  // the event status without first visiting Config. CheckinSettings reuses
  // this DTO and only emits updates after a successful mutation.
  const [checkinStatus, setCheckinStatus] = useState<CheckinStatus | null>(null)
  const [checkinStatusEventSlug, setCheckinStatusEventSlug] = useState('')
  const [checkinStatusLoading, setCheckinStatusLoading] = useState(false)
  const [checkinStatusError, setCheckinStatusError] = useState('')
  const checkinStatusMatchesSelection = checkinStatusEventSlug === selectedEventId
  const selectedCheckinStatus = checkinStatusMatchesSelection ? checkinStatus : null
  const selectedCheckinStatusLoading = Boolean(selectedEventId)
    && (!checkinStatusMatchesSelection || checkinStatusLoading)
  const selectedCheckinStatusError = checkinStatusMatchesSelection ? checkinStatusError : ''


  // Estado para configuración del evento
  const [configForm, setConfigForm] = useState({
    title: eventConfig.event.title,
    displayTitle: '', // Empty means no visible title on the invitation page
    subtitle: eventConfig.event.subtitle,
    date: eventConfig.event.date,
    time: eventConfig.event.time,
    location: eventConfig.event.location,
    details: eventConfig.event.details,
    priceEnabled: true,
    priceAmount: 250,
    // ISSUE-010: gates whether Stripe Checkout is required to confirm this
    // event's RSVP. Only ever writable while priceEnabled && priceAmount>0
    // (enforced server-side too — lib/payment-config.ts) — the toggle below
    // disables itself otherwise.
    paymentRequired: false,
    capacityEnabled: true,
    capacityLimit: 100,
    backgroundImage: eventConfig.event.backgroundImage,
    presentationMode: 'classic' as PresentationMode,
    rsvpTitle: 'RSVP INDISPENSABLE',
    rsvpButtonLabel: 'CONFIRMAR ASISTENCIA',
    backgroundOverlayStrength: 20,
    backgroundImageFit: 'cover' as BackgroundImageFit,
    backgroundImagePosition: 'center' as BackgroundImagePosition,
    ogImage: '', // Dedicated OG image for social previews (1200x630)
    // Theme colors
    primaryColor: '#FF1493',
    secondaryColor: '#00FFFF',
    accentColor: '#FFD700',
    backgroundColor: '#1a0033',
    // Email configuration
    emailConfirmationEnabled: false,
    // ISSUE-008: gates whether a guest must click a verification link before
    // their RSVP counts as confirmed (bypassed by private invite links and
    // by paid events — see the helper text next to the toggle).
    emailVerificationEnabled: false,
    reminderEnabled: false,
    reminderScheduledAt: '',
    reminderSentAt: null as string | null,
    // Plus-one configuration
    requirePlusOneName: false,
    // RSVP Closed configuration
    rsvpClosed: false,
    rsvpClosedMessage: '¡Nos vemos en el próximo evento!'
  })

  // Filtros para MOSTRAR en tabla
  const [displayFilterStatus, setDisplayFilterStatus] = useState<RsvpStatusFilter>('all')
  const [displayFilterPlusOne, setDisplayFilterPlusOne] = useState<RsvpPlusOneFilter>('all')
  const [displayFilterEmail, setDisplayFilterEmail] = useState<RsvpEmailFilter>('all')
  // ISSUE-013: only ever surfaced in the UI for a payment_required event —
  // see configForm.paymentRequired below.
  const [displayFilterPayment, setDisplayFilterPayment] = useState<RsvpPaymentFilter>('all')
  const [rsvpSort, setRsvpSort] = useState<RsvpSort>('name-asc')
  const [rsvpPageSize, setRsvpPageSize] = useState<RsvpPageSize>(25)
  const [rsvpPage, setRsvpPage] = useState(1)
  const [pendingRsvpTarget, setPendingRsvpTarget] = useState<string | null>(null)
  const [highlightedRsvpId, setHighlightedRsvpId] = useState<string | null>(null)
  const navigatingToRsvpRef = useRef(false)

  // Filtros para ENVIAR emails (default: solo confirmados sin email)
  const [emailFilterStatus, setEmailFilterStatus] = useState<RsvpStatusFilter>('confirmed')
  const [emailFilterEmail, setEmailFilterEmail] = useState<RsvpEmailFilter>('not-sent')

  const rsvpListOptions = useMemo(() => ({
    searchTerm,
    status: displayFilterStatus,
    plusOne: displayFilterPlusOne,
    email: displayFilterEmail,
    sort: rsvpSort,
    page: rsvpPage,
    pageSize: rsvpPageSize,
    paymentStatus: displayFilterPayment,
  }), [
    searchTerm,
    displayFilterStatus,
    displayFilterPlusOne,
    displayFilterEmail,
    rsvpSort,
    rsvpPage,
    rsvpPageSize,
    displayFilterPayment,
  ])

  const rsvpListView = useMemo(
    () => buildRsvpListView(rsvps, rsvpListOptions),
    [rsvps, rsvpListOptions],
  )

  const [message, setMessage] = useState('')

  // Estado para modal de edición
  const [editingRsvp, setEditingRsvp] = useState<RSVP | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    plusOne: false,
    plusOneName: ''
  })

  // Estado para modal de edición de slug
  const [editingSlugEvent, setEditingSlugEvent] = useState<Event | null>(null)
  const [newSlug, setNewSlug] = useState('')

  // Estado para carga de imagen de fondo
  const [imageMethod, setImageMethod] = useState<'url' | 'upload'>('url')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Estado para carga de imagen OG (redes sociales)
  const [ogImageMethod, setOgImageMethod] = useState<'url' | 'upload'>('url')
  const [isUploadingOg, setIsUploadingOg] = useState(false)
  const [uploadErrorOg, setUploadErrorOg] = useState('')
  const ogFileInputRef = useRef<HTMLInputElement>(null)

  // Check authentication on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me')
        const data = await res.json()
        if (data.authenticated && data.user) {
          setIsAuthenticated(true)
          setCurrentUser(data.user)
        } else {
          // Not authenticated, redirect to login
          router.replace('/login')
        }
      } catch {
        router.replace('/login')
      } finally {
        setCheckingAuth(false)
      }
    }
    checkAuth()
  }, [router])

  const handleCheckinStatusChange = useCallback((status: CheckinStatus) => {
    setCheckinStatusEventSlug(selectedEventId)
    setCheckinStatus(status)
    setCheckinStatusError('')
  }, [selectedEventId])

  const selectConfigSection = useCallback((section: ConfigSectionId) => {
    setActiveConfigSection(section)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#config-${section}`)
    }
  }, [])

  const openConfigSection = useCallback((section: ConfigSectionId) => {
    selectConfigSection(section)
    setActiveTab('config')
  }, [selectConfigSection])

  useEffect(() => {
    if (activeTab !== 'config') return

    const syncFromHash = () => {
      const section = configSectionFromHash(window.location.hash)
      if (section) setActiveConfigSection(section)
    }

    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [activeTab])

  // Keep the dashboard's portal status authoritative for the selected event.
  // CheckinSettings consumes this state instead of issuing a duplicate GET.
  useEffect(() => {
    const controller = new AbortController()
    setCheckinStatus(null)
    setCheckinStatusError('')

    if (!isAuthenticated || !selectedEventId) {
      setCheckinStatusEventSlug('')
      setCheckinStatusLoading(false)
      return () => controller.abort()
    }

    setCheckinStatusEventSlug(selectedEventId)
    setCheckinStatusLoading(true)
    async function loadCheckinStatus() {
      try {
        const response = await fetch(
          `/api/admin/checkin-config?eventSlug=${encodeURIComponent(selectedEventId)}`,
          { cache: 'no-store', signal: controller.signal },
        )
        const data: unknown = await response.json()
        if (!response.ok) {
          const detail = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
            ? data.error
            : 'No se pudo cargar el estado del check-in.'
          throw new Error(detail)
        }
        const status = parseCheckinStatusPayload(data)
        if (!status) throw new Error('La respuesta del estado de check-in no es válida.')
        if (!controller.signal.aborted) setCheckinStatus(status)
      } catch (error) {
        if (controller.signal.aborted) return
        setCheckinStatusError(error instanceof Error ? error.message : 'No se pudo cargar el estado del check-in.')
      } finally {
        if (!controller.signal.aborted) setCheckinStatusLoading(false)
      }
    }

    void loadCheckinStatus()
    return () => controller.abort()
  }, [isAuthenticated, selectedEventId])

  const loadRSVPs = useCallback(async (eventId?: string) => {
    setLoading(true)
    try {
      const targetEventId = eventId || selectedEventId
      console.log('🔄 Cargando RSVPs para evento:', targetEventId)

      // Cookies are sent automatically
      const response = await fetch(`/api/rsvp?eventId=${encodeURIComponent(targetEventId)}`)

      if (!response.ok) {
        throw new Error('Error al cargar RSVPs')
      }

      const data = await response.json()

      console.log('✅ RSVPs recibidos:', data)
      console.log('📊 data.success:', data.success)
      console.log('📊 data.rsvps:', data.rsvps)
      console.log('📊 data.rsvps length:', data.rsvps?.length)

      if (data.success && data.rsvps) {
        setRsvps(data.rsvps)

        // Ajustar filtro de email inteligentemente
        const notSentCount = data.rsvps.filter((r: RSVP) => !r.emailSent).length
        if (notSentCount > 0) {
          setEmailFilterEmail('not-sent') // Hay gente sin email, enviar a ellos
        } else {
          setEmailFilterEmail('all') // Todos tienen email, default a todos
        }

        console.log('✅ RSVPs guardados en estado:', data.rsvps.length)
      } else {
        console.log('⚠️ No hay RSVPs o success es false')
      }
    } catch (error) {
      console.error('❌ Error cargando RSVPs:', error)
      setMessage('Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [selectedEventId])

  // RSVPs will be loaded by the useEffect watching selectedEventId once it's initialized

  // Cargar lista de eventos
  const loadEvents = async () => {
    try {
      const response = await fetch('/api/events')
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.events) {
          setEvents(data.events)
        }
      }
    } catch (error) {
      console.error('Error cargando eventos:', error)
    }
  }

  // Cargar settings de la app
  const loadAppSettings = async () => {
    try {
      const response = await fetch('/api/admin/settings')
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.settings) {
          setHomeEventId(data.settings.home_event_id || '')
        }
      }
    } catch (error) {
      console.error('Error cargando settings:', error)
    }
  }

  // Marcar como evento de inicio
  const setAsHome = async (eventId: string) => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: 'home_event_id', value: eventId })
      })

      if (response.ok) {
        setHomeEventId(eventId)
        setMessage(`✅ Evento establecido como página de inicio`)
        setTimeout(() => setMessage(''), 3000)
      } else {
        setMessage('❌ Error al guardar configuración')
      }
    } catch (error) {
      console.error('Error guardando home event:', error)
      setMessage('❌ Error de conexión')
    } finally {
      setLoading(false)
    }
  }


  // Initialize from localStorage on mount
  useEffect(() => {
    const savedEvent = localStorage.getItem('rp_selected_event')
    if (savedEvent) {
      setSelectedEventId(savedEvent)
    }
  }, [])

  // Save to localStorage when selection changes
  useEffect(() => {
    if (selectedEventId) {
      localStorage.setItem('rp_selected_event', selectedEventId)
    }
  }, [selectedEventId])

  // Cargar eventos al montar
  useEffect(() => {
    if (isAuthenticated) {
      loadEvents()
      loadAppSettings()
    }
  }, [isAuthenticated])

  // Auto-select event when data is loaded
  useEffect(() => {
    // Only run if we don't have a selection yet
    if (!selectedEventId && events.length > 0) {
      const savedEvent = localStorage.getItem('rp_selected_event')

      // 1. Try to restore from localStorage if the event still exists
      if (savedEvent && events.some(e => e.slug === savedEvent)) {
        setSelectedEventId(savedEvent)
      }
      // 2. Otherwise try to select the home event
      else if (homeEventId) {
        const homeEvent = events.find(e => e.id === homeEventId)
        if (homeEvent) {
          setSelectedEventId(homeEvent.slug)
        } else {
          setSelectedEventId(events[0].slug)
        }
      }
      // 3. Last fallback: first event in list
      else {
        setSelectedEventId(events[0].slug)
      }
    }
  }, [homeEventId, events, selectedEventId])


  // Cargar configuración del evento seleccionado
  const loadEventConfig = async (eventId: string) => {
    try {
      console.log('⚙️ Cargando configuración para evento:', eventId)
      const response = await fetch(`/api/event-settings?eventId=${encodeURIComponent(eventId)}`)
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.settings) {
          console.log('✅ Configuración cargada:', data.settings.title)
          const presentation = normalizeEventPresentation(data.settings)
          setConfigForm({
            title: data.settings.title || '',
            displayTitle: data.settings.displayTitle || '',
            subtitle: data.settings.subtitle || '',
            date: data.settings.date || '',
            time: data.settings.time || '',
            location: data.settings.location || '',
            details: data.settings.details || '',
            ...presentation,
            priceEnabled: data.settings.price?.enabled || false,
            priceAmount: data.settings.price?.amount || 0,
            paymentRequired: data.settings.paymentRequired || false,
            capacityEnabled: data.settings.capacity?.enabled || false,
            capacityLimit: data.settings.capacity?.limit || 0,
            backgroundImage: data.settings.backgroundImage?.url || '/background.png',
            ogImage: data.settings.ogImage?.url || '', // Dedicated OG image
            // Theme colors
            primaryColor: data.settings.theme?.primaryColor || '#FF1493',
            secondaryColor: data.settings.theme?.secondaryColor || '#00FFFF',
            accentColor: data.settings.theme?.accentColor || '#FFD700',
            backgroundColor: data.settings.theme?.backgroundColor || '#1a0033',
            // Email configuration
            emailConfirmationEnabled: data.settings.emailConfig?.confirmationEnabled || false,
            emailVerificationEnabled: data.settings.emailVerificationEnabled || false,
            reminderEnabled: data.settings.emailConfig?.reminderEnabled || false,
            reminderScheduledAt: data.settings.emailConfig?.reminderScheduledAt
              // A1-03: load the stored UTC instant as a LOCAL wall-clock for the
              // datetime-local input. Saving does `new Date(value).toISOString()`
              // (local -> UTC), so producing local here makes the round-trip
              // stable (was UTC wall-clock -> reinterpreted as local -> +offset
              // drift every save, which defeated the A1-01 re-arm check).
              ? (() => { const d = new Date(data.settings.emailConfig.reminderScheduledAt); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) })()
              : '',
            reminderSentAt: data.settings.emailConfig?.reminderSentAt || null,
            // Plus-one configuration
            requirePlusOneName: data.settings.requirePlusOneName || false,
            // RSVP Closed configuration
            rsvpClosed: data.settings.rsvpClosed || false,
            rsvpClosedMessage: data.settings.rsvpClosedMessage || '¡Nos vemos en el próximo evento!'
          })
          setStripeConfigured(data.settings.stripeConfigured !== false)
        }
      }
    } catch (error) {
      console.error('Error cargando configuración del evento:', error)
    }
  }

  // Cargar configuración cuando cambia el evento seleccionado
  useEffect(() => {
    if (isAuthenticated && selectedEventId) {
      loadEventConfig(selectedEventId)
    }
  }, [selectedEventId, isAuthenticated])

  // Recargar RSVPs cuando cambia el evento seleccionado
  useEffect(() => {
    if (isAuthenticated && selectedEventId) {
      loadRSVPs(selectedEventId)
    }
  }, [selectedEventId, isAuthenticated, loadRSVPs])

  // Regresar a la primera página cuando cambia la vista preparada.
  useEffect(() => {
    if (navigatingToRsvpRef.current) {
      navigatingToRsvpRef.current = false
      return
    }
    setRsvpPage(1)
  }, [
    selectedEventId,
    searchTerm,
    displayFilterStatus,
    displayFilterPlusOne,
    displayFilterEmail,
    displayFilterPayment,
    rsvpSort,
    rsvpPageSize,
  ])

  // Mantener la página válida si la lista cambia después de editar un RSVP.
  useEffect(() => {
    if (rsvpPage !== rsvpListView.page) {
      setRsvpPage(rsvpListView.page)
    }
  }, [rsvpPage, rsvpListView.page])

  const navigateToRsvp = useCallback((rsvpId: string) => {
    const orderedRsvps = filterAndSortRsvps(rsvps, {
      searchTerm: '',
      status: 'all',
      plusOne: 'all',
      email: 'all',
      sort: rsvpSort,
    })
    const targetIndex = orderedRsvps.findIndex(rsvp => rsvp.id === rsvpId)
    if (targetIndex < 0) {
      setMessage('El invitado asociado ya no está disponible en este evento.')
      return
    }

    const willResetDisplayFilters = searchTerm !== ''
      || displayFilterStatus !== 'all'
      || displayFilterPlusOne !== 'all'
      || displayFilterEmail !== 'all'
      || displayFilterPayment !== 'all'
    navigatingToRsvpRef.current = willResetDisplayFilters
    setSearchTerm('')
    setDisplayFilterStatus('all')
    setDisplayFilterPlusOne('all')
    setDisplayFilterEmail('all')
    setDisplayFilterPayment('all')
    setRsvpPage(Math.floor(targetIndex / rsvpPageSize) + 1)
    setPendingRsvpTarget(rsvpId)
    setHighlightedRsvpId(rsvpId)
  }, [
    displayFilterEmail,
    displayFilterPayment,
    displayFilterPlusOne,
    displayFilterStatus,
    rsvpPageSize,
    rsvpSort,
    rsvps,
    searchTerm,
  ])

  useEffect(() => {
    if (!pendingRsvpTarget) return
    const target = document.getElementById(`rsvp-guest-${pendingRsvpTarget}`)
    if (!target) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' })
    target.focus({ preventScroll: true })
    setPendingRsvpTarget(null)
  }, [pendingRsvpTarget, rsvpListView.pageItems])

  useEffect(() => {
    if (!highlightedRsvpId) return
    const highlightTimer = window.setTimeout(() => setHighlightedRsvpId(null), 3000)
    return () => window.clearTimeout(highlightTimer)
  }, [highlightedRsvpId])

  // Filtrar RSVPs para ENVIAR emails
  useEffect(() => {
    let filtered = [...rsvps]

    // Filtro por status
    if (emailFilterStatus !== 'all') {
      filtered = filtered.filter(r => r.status === emailFilterStatus)
    }

    // Filtro por email enviado
    if (emailFilterEmail === 'sent') {
      filtered = filtered.filter(r => r.emailSent)
    } else if (emailFilterEmail === 'not-sent') {
      filtered = filtered.filter(r => !r.emailSent)
    }

    setEmailTargetRsvps(filtered)
  }, [rsvps, emailFilterStatus, emailFilterEmail])

  // Helper: Check if event date has passed
  // Event dates are stored as text like "SÁBADO, 29 NOV" or "2025-01-30"
  // Returns true if the event is in the past (before today)
  const isEventPast = (): boolean => {
    const dateStr = configForm.date
    if (!dateStr) return false

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Try to parse various date formats
    const monthMap: { [key: string]: number } = {
      'ene': 0, 'jan': 0, 'enero': 0, 'january': 0,
      'feb': 1, 'febrero': 1, 'february': 1,
      'mar': 2, 'marzo': 2, 'march': 2,
      'abr': 3, 'apr': 3, 'abril': 3, 'april': 3,
      'may': 4, 'mayo': 4,
      'jun': 5, 'junio': 5, 'june': 5,
      'jul': 6, 'julio': 6, 'july': 6,
      'ago': 7, 'aug': 7, 'agosto': 7, 'august': 7,
      'sep': 8, 'sept': 8, 'septiembre': 8, 'september': 8,
      'oct': 9, 'octubre': 9, 'october': 9,
      'nov': 10, 'noviembre': 10, 'november': 10,
      'dic': 11, 'dec': 11, 'diciembre': 11, 'december': 11
    }

    // Try ISO format first (2025-01-30). Parse as a LOCAL date (not `new
    // Date(str)`, which is UTC) so an event on its own day is not marked past
    // due to a UTC/local offset in MX time (A4-01).
    const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) {
      const eventDate = new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]))
      return eventDate < today
    }

    // Try to extract day and month from text like "SÁBADO, 29 NOV" or "29 de noviembre"
    // Flexible regex: day followed by any chars, then month abbreviation
    const match = dateStr.match(/(\d{1,2})[^\d]*([a-zA-Z]{3,})/i)
    if (match) {
      const day = parseInt(match[1])
      const monthStr = match[2].toLowerCase()
      const month = monthMap[monthStr]

      console.log('[isEventPast] Parsed date string:', dateStr, '-> day:', day, 'monthStr:', monthStr, 'month:', month)

      if (month !== undefined) {
        // A4-01: free-text dates carry no year and there is no reliable way to
        // recover it. Use the current year and never roll it back — the old
        // "more than 2 months ahead => last year" rule marked legitimately-future
        // events (e.g. a November event viewed in July) as past and blocked all
        // manual sends. Genuinely-old text dates stay flagged as past. (A robust
        // fix requires a structured event date — tracked as A2-H14/B15.)
        const eventDate = new Date(now.getFullYear(), month, day)
        return eventDate < today
      }
    }

    console.log('[isEventPast] Could not parse date:', dateStr)
    // If we can't parse, don't block (allow sending)
    return false
  }

  // Enviar email individual
  const sendEmail = async (rsvp: RSVP) => {
    // Check if event has passed
    if (isEventPast()) {
      setMessage('❌ No se pueden enviar emails para eventos que ya pasaron')
      return
    }

    const isCancelled = rsvp.status === 'cancelled'
    const isReminder = !isCancelled && !!rsvp.emailSent

    let messageType = 'email de confirmación'
    if (isCancelled) messageType = 'email de re-invitación'
    else if (isReminder) messageType = 'email recordatorio'

    // Confirmación antes de enviar
    const confirmed = window.confirm(
      `¿Estás seguro de enviar ${messageType} a ${rsvp.name} (${rsvp.email})?`
    )

    if (!confirmed) {
      return // Usuario canceló
    }

    setLoading(true)
    setMessage(`Enviando ${messageType}...`)

    try {
      const response = await fetch('/api/admin/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rsvpId: rsvp.id,
          name: rsvp.name,
          email: rsvp.email,
          plusOne: rsvp.plusOne,
          emailSent: rsvp.emailSent,
          status: rsvp.status
        })
      })

      console.log('📬 Response status:', response.status)
      const data = await response.json()
      console.log('📬 Response data:', data)

      if (data.success) {
        setMessage(`✅ ${isCancelled ? 'Re-invitación' : (isReminder ? 'Recordatorio' : 'Email')} enviado a ${rsvp.name}`)
        await loadRSVPs()
      } else {
        setMessage(`❌ Error: ${data.error}`)
      }
    } catch (error) {
      setMessage('❌ Error al enviar email')
    } finally {
      setLoading(false)
    }
  }

  // Enviar emails masivos
  const sendBulkEmails = async () => {
    // Check if event has passed
    if (isEventPast()) {
      setMessage('❌ No se pueden enviar emails para eventos que ya pasaron')
      return
    }

    const count = emailTargetRsvps.length
    if (count === 0) {
      setMessage('❌ No hay RSVPs para enviar')
      return
    }

    // Contar por tipo de email
    const cancelledCount = emailTargetRsvps.filter(r => r.status === 'cancelled').length
    const notSentCount = emailTargetRsvps.filter(r => r.status === 'confirmed' && !r.emailSent).length
    const remindersCount = emailTargetRsvps.filter(r => r.status === 'confirmed' && r.emailSent).length

    // Mensaje de confirmación detallado
    let confirmParts = [`¿Enviar emails a ${count} personas?`]
    if (notSentCount > 0) confirmParts.push(`\n• ${notSentCount} confirmación${notSentCount > 1 ? 'es' : ''}`)
    if (remindersCount > 0) confirmParts.push(`\n• ${remindersCount} recordatorio${remindersCount > 1 ? 's' : ''}`)
    if (cancelledCount > 0) confirmParts.push(`\n• ${cancelledCount} re-invitación${cancelledCount > 1 ? 'es' : ''}`)

    if (!confirm(confirmParts.join(''))) {
      return
    }

    setLoading(true)
    setMessage('Enviando emails...')

    try {
      // Enviar lista de IDs específicos de los RSVPs filtrados para email
      const response = await fetch('/api/admin/send-bulk-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          eventId: selectedEventId,
          rsvpIds: emailTargetRsvps.map(r => r.id)
        })
      })

      const data = await response.json()

      if (data.success) {
        setMessage(`✅ Enviados: ${data.sent} | ❌ Fallidos: ${data.failed}`)
        await loadRSVPs()
      } else {
        setMessage(`❌ Error: ${data.error}`)
      }
    } catch (error) {
      setMessage('❌ Error al enviar emails')
    } finally {
      setLoading(false)
    }
  }

  // Toggle status (confirmar/cancelar) sin enviar email
  const toggleStatus = async (rsvp: RSVP) => {
    const newStatus = rsvp.status === 'confirmed' ? 'cancelled' : 'confirmed'
    const action = newStatus === 'confirmed' ? 'reconfirmar' : 'cancelar'

    if (!confirm(`¿${action.charAt(0).toUpperCase() + action.slice(1)} asistencia de ${rsvp.name}? (sin enviar email)`)) {
      return
    }

    setLoading(true)
    setMessage(`${action.charAt(0).toUpperCase() + action.slice(1)}ando...`)

    try {
      const response = await fetch('/api/admin/update-rsvp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rsvpId: rsvp.id,
          updates: { status: newStatus }
        })
      })

      const data = await response.json()

      if (data.success) {
        setMessage(`✅ ${rsvp.name} ${newStatus === 'confirmed' ? 'reconfirmado' : 'cancelado'}`)
        await loadRSVPs()
      } else {
        setMessage(`❌ Error: ${data.error}`)
      }
    } catch (error) {
      setMessage('❌ Error al actualizar estado')
    } finally {
      setLoading(false)
    }
  }

  // Abrir modal de edición
  const openEditModal = (rsvp: RSVP) => {
    setEditingRsvp(rsvp)
    setEditForm({
      name: rsvp.name,
      email: rsvp.email,
      phone: rsvp.phone,
      plusOne: rsvp.plusOne,
      plusOneName: rsvp.plusOneName || ''
    })
  }

  // Cerrar modal de edición
  const closeEditModal = () => {
    setEditingRsvp(null)
    setEditForm({
      name: '',
      email: '',
      phone: '',
      plusOne: false,
      plusOneName: ''
    })
  }

  // Guardar cambios de edición
  const saveEdit = async () => {
    if (!editingRsvp) return

    if (!editForm.name.trim() || !editForm.email.trim() || !editForm.phone.trim()) {
      setMessage('❌ Nombre, email y teléfono son requeridos')
      return
    }

    if (!confirm(`¿Guardar cambios para ${editingRsvp.name}?`)) {
      return
    }

    setLoading(true)
    setMessage('Guardando cambios...')

    try {
      const response = await fetch('/api/admin/update-rsvp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rsvpId: editingRsvp.id,
          updates: {
            ...editForm,
            plusOne: isPlusOneLockedForPayment(editingRsvp.paymentStatus)
              ? editingRsvp.plusOne
              : editForm.plusOne,
          }
        })
      })

      const data = await response.json()

      if (data.success) {
        setMessage(`✅ Datos actualizados para ${editForm.name}`)
        closeEditModal()
        await loadRSVPs()
      } else {
        setMessage(`❌ Error: ${data.error}`)
      }
    } catch (error) {
      setMessage('❌ Error al guardar cambios')
    } finally {
      setLoading(false)
    }
  }

  // Abrir modal de edición de slug
  const openEditSlugModal = (evt: Event) => {
    setEditingSlugEvent(evt)
    setNewSlug(evt.slug)
  }

  // Cerrar modal de edición de slug
  const closeEditSlugModal = () => {
    setEditingSlugEvent(null)
    setNewSlug('')
  }

  // Guardar nuevo slug
  const saveNewSlug = async () => {
    if (!editingSlugEvent) return

    const trimmedSlug = newSlug.trim().toLowerCase()

    // Validar formato
    if (!/^[a-z0-9-]+$/.test(trimmedSlug)) {
      setMessage('❌ El slug solo puede contener letras minúsculas, números y guiones')
      return
    }

    if (trimmedSlug.length < 2) {
      setMessage('❌ El slug debe tener al menos 2 caracteres')
      return
    }

    if (trimmedSlug === editingSlugEvent.slug) {
      closeEditSlugModal()
      return
    }

    const confirmed = window.confirm(
      `¿Estás seguro de cambiar el slug de "${editingSlugEvent.slug}" a "${trimmedSlug}"?\n\n` +
      `⚠️ Esto cambiará la URL del evento y actualizará todas las referencias.\n` +
      `• URL antigua: /${editingSlugEvent.slug}\n` +
      `• URL nueva: /${trimmedSlug}\n\n` +
      `Los enlaces compartidos anteriormente dejarán de funcionar.`
    )

    if (!confirmed) return

    setLoading(true)
    setMessage('Actualizando slug...')

    try {
      const response = await fetch(`/api/events/${editingSlugEvent.slug}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newSlug: trimmedSlug })
      })

      const data = await response.json()

      if (data.success) {
        let msg = `✅ Slug cambiado exitosamente a "/${trimmedSlug}"`
        if (data.updatedRsvps > 0) {
          msg += ` | ${data.updatedRsvps} RSVP(s) actualizados`
        }
        if (data.ogImages?.renamed?.length > 0) {
          msg += ` | ${data.ogImages.renamed.length} imagen(es) OG renombrada(s)`
        }
        if (data.ogImages?.errors?.length > 0) {
          msg += ` | ⚠️ ${data.ogImages.errors.length} error(es) en imágenes`
          console.warn('OG Image rename errors:', data.ogImages.errors)
        }
        setMessage(msg)

        // Actualizar el evento seleccionado si era el que cambiamos
        if (selectedEventId === editingSlugEvent.slug) {
          setSelectedEventId(trimmedSlug)
        }

        closeEditSlugModal()
        loadEvents() // Recargar lista de eventos

        setTimeout(() => setMessage(''), 5000)
      } else {
        setMessage(`❌ Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error al cambiar slug:', error)
      setMessage('❌ Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  // Guardar configuración del evento
  const saveEventConfig = async (e: React.FormEvent) => {
    e.preventDefault()

    const validationFailure = (() => {
      if (!configForm.title.trim()) {
        return { section: 'general' as const, disclosure: 'identity' as const, fieldId: 'config-title', message: 'Escribe el nombre interno del evento.' }
      }
      if (!Number.isInteger(configForm.priceAmount) || configForm.priceAmount < 0) {
        return { section: 'guests' as const, disclosure: 'payment' as const, fieldId: 'config-price-amount', message: 'La cuota debe ser un número entero de $0 MXN o más.' }
      }
      if (configForm.paymentRequired && (!configForm.priceEnabled || configForm.priceAmount <= 0)) {
        return { section: 'guests' as const, disclosure: 'payment' as const, fieldId: 'config-price-amount', message: 'Para cobrar con Stripe, la cuota por persona debe ser mayor a $0 MXN.' }
      }
      if (configForm.capacityEnabled && (!Number.isInteger(configForm.capacityLimit) || configForm.capacityLimit < 1)) {
        return { section: 'guests' as const, disclosure: 'capacity' as const, fieldId: 'config-capacity-limit', message: 'El límite de capacidad debe ser un número entero de al menos 1.' }
      }
      if (!configForm.rsvpButtonLabel.trim()) {
        return { section: 'design' as const, disclosure: 'presentation' as const, fieldId: 'rsvpButtonLabel', message: 'Escribe el texto del botón RSVP.' }
      }
      if (configForm.rsvpButtonLabel.trim().length > 80) {
        return { section: 'design' as const, disclosure: 'presentation' as const, fieldId: 'rsvpButtonLabel', message: 'El texto del botón RSVP no puede exceder 80 caracteres.' }
      }
      if (configForm.backgroundImageFit === 'contain' && !parseStrictHexColor(configForm.backgroundColor)) {
        return { section: 'design' as const, disclosure: 'presentation' as const, fieldId: 'containBackgroundColor', message: 'Escribe un color de relleno HEX válido, por ejemplo #1a0033.' }
      }
      if (configForm.reminderEnabled && !configForm.reminderScheduledAt) {
        return { section: 'messages' as const, disclosure: 'reminder' as const, fieldId: 'config-reminder-at', message: 'Selecciona fecha y hora para el recordatorio.' }
      }
      if (configForm.reminderEnabled && Number.isNaN(new Date(configForm.reminderScheduledAt).getTime())) {
        return { section: 'messages' as const, disclosure: 'reminder' as const, fieldId: 'config-reminder-at', message: 'Selecciona una fecha y hora válidas para el recordatorio.' }
      }
      return null
    })()

    if (validationFailure) {
      selectConfigSection(validationFailure.section)
      setConfigValidationReveal(current => ({
        id: validationFailure.disclosure,
        nonce: current.nonce + 1,
      }))
      setMessage(`❌ ${validationFailure.message}`)
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => document.getElementById(validationFailure.fieldId)?.focus())
      })
      return
    }

    setLoading(true)
    setMessage('')

    try {
      console.log('💾 Guardando configuración...')

      const requestBody = {
        eventId: selectedEventId,
        title: configForm.title,
        displayTitle: configForm.displayTitle,
        subtitle: configForm.subtitle,
        date: configForm.date,
        time: configForm.time,
        location: configForm.location,
        details: configForm.details,
        presentationMode: configForm.presentationMode,
        rsvpTitle: configForm.rsvpTitle,
        rsvpButtonLabel: configForm.rsvpButtonLabel,
        backgroundOverlayStrength: configForm.backgroundOverlayStrength,
        backgroundImageFit: configForm.backgroundImageFit,
        backgroundImagePosition: configForm.backgroundImagePosition,
        price: {
          enabled: configForm.priceEnabled,
          amount: configForm.priceAmount,
          currency: 'MXN'
        },
        // ISSUE-010: cross-validated server-side against price.enabled/amount
        // (lib/payment-config.ts) — a 400 here means the toggle below was
        // somehow enabled without a valid price (should be prevented by the
        // `disabled` attribute already, this is defense in depth).
        paymentRequired: configForm.paymentRequired,
        capacity: {
          enabled: configForm.capacityEnabled,
          limit: configForm.capacityLimit
        },
        backgroundImage: {
          url: configForm.backgroundImage,
          uploadedAt: null
        },
        ogImage: {
          url: configForm.ogImage
        },
        theme: {
          primaryColor: configForm.primaryColor,
          secondaryColor: configForm.secondaryColor,
          accentColor: configForm.accentColor,
          backgroundColor: configForm.backgroundColor
        },
        // Email configuration
        emailConfig: {
          confirmationEnabled: configForm.emailConfirmationEnabled,
          reminderEnabled: configForm.reminderEnabled,
          reminderScheduledAt: configForm.reminderEnabled && configForm.reminderScheduledAt
            ? new Date(configForm.reminderScheduledAt).toISOString()
            : null
          // Re-arm on schedule change is decided server-side (A1-01); no client flag.
        },
        // Plus-one configuration
        requirePlusOneName: configForm.requirePlusOneName,
        // RSVP Closed configuration
        rsvpClosed: configForm.rsvpClosed,
        rsvpClosedMessage: configForm.rsvpClosedMessage,
        // Email verification configuration (ISSUE-008)
        emailVerificationEnabled: configForm.emailVerificationEnabled
      }

      console.log('🖼️ backgroundImage URL being sent:', configForm.backgroundImage)
      console.log('📦 Request body:', requestBody)

      const response = await fetch('/api/admin/event-settings/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      console.log('📨 Response status:', response.status)
      const data = await response.json()
      console.log('📨 Response data:', data)

      if (data.success) {
        setMessage('✅ Configuración guardada correctamente')
      } else {
        setMessage(`❌ Error: ${data.message}`)
      }
    } catch (error) {
      console.error('❌ Error al guardar:', error)
      setMessage('❌ Error al guardar configuración')
    } finally {
      setLoading(false)
    }
  }

  // Manejar subida de imagen
  const handleImageUpload = async (file: File) => {
    setUploadError('')
    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('eventSlug', selectedEventId)

      const response = await fetch('/api/admin/upload-image', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (data.success) {
        // Update local state with new image URL
        const newImageUrl = data.imageUrl
        setConfigForm({ ...configForm, backgroundImage: newImageUrl })
        setMessage('✅ Imagen subida, guardando configuración...')
        
        // Auto-save to database so user doesn't have to click "Guardar" separately
        try {
          const saveResponse = await fetch('/api/admin/event-settings/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventId: selectedEventId,
              backgroundImage: { url: newImageUrl, uploadedAt: new Date().toISOString() }
            })
          })
          
          const saveData = await saveResponse.json()
          if (saveData.success) {
            setMessage('✅ Imagen guardada correctamente')
          } else {
            setMessage('⚠️ Imagen subida pero no se pudo guardar. Por favor guarda la configuración manualmente.')
          }
        } catch {
          setMessage('⚠️ Imagen subida pero no se pudo guardar. Por favor guarda la configuración manualmente.')
        }
        
        setTimeout(() => setMessage(''), 4000)
      } else {
        setUploadError(data.error || 'Error al subir la imagen')
      }
    } catch (error) {
      console.error('Error uploading image:', error)
      setUploadError('Error de conexión al subir la imagen')
    } finally {
      setIsUploading(false)
    }
  }

  // Manejar cambio de archivo seleccionado (background)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleImageUpload(file)
    }
  }

  // Manejar subida de imagen OG (redes sociales)
  const handleOgImageUpload = async (file: File) => {
    setUploadErrorOg('')
    setIsUploadingOg(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('eventSlug', selectedEventId)
      formData.append('imageType', 'og') // Flag to indicate this is an OG image

      const response = await fetch('/api/admin/upload-image', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (data.success) {
        // Update local state with new image URL
        const newImageUrl = data.imageUrl
        setConfigForm({ ...configForm, ogImage: newImageUrl })
        setMessage('✅ Imagen OG subida, guardando configuración...')
        
        // Auto-save to database
        try {
          const saveResponse = await fetch('/api/admin/event-settings/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventId: selectedEventId,
              ogImage: { url: newImageUrl }
            })
          })
          
          const saveData = await saveResponse.json()
          if (saveData.success) {
            setMessage('✅ Imagen OG guardada correctamente')
          } else {
            setMessage('⚠️ Imagen subida pero no se pudo guardar. Por favor guarda la configuración manualmente.')
          }
        } catch {
          setMessage('⚠️ Imagen subida pero no se pudo guardar. Por favor guarda la configuración manualmente.')
        }
        
        setTimeout(() => setMessage(''), 4000)
      } else {
        setUploadErrorOg(data.error || 'Error al subir la imagen')
      }
    } catch (error) {
      console.error('Error uploading OG image:', error)
      setUploadErrorOg('Error de conexión al subir la imagen')
    } finally {
      setIsUploadingOg(false)
    }
  }

  // Manejar cambio de archivo OG seleccionado
  const handleOgFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleOgImageUpload(file)
    }
  }

  // Cerrar sesión
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Ignore errors, still redirect
    }
    setIsAuthenticated(false)
    setCurrentUser(null)
    router.replace('/login')
  }

  // Helper function to strip emojis from text (jsPDF doesn't support Unicode emojis)
  const stripEmojis = (text: string): string => {
    if (!text) return ''
    // Remove emojis and other extended Unicode characters
    return text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]/gu, '').trim()
  }

  // Exportar lista informativa (elegante con todos los detalles)
  const exportInformativeList = () => {
    const doc = new jsPDF()
    const exportRsvps = rsvpListView.filteredAndSorted
    const exportSummary = describeRsvpListView(rsvpListOptions)
    const metadataRows = buildEventExportMetadataRows(configForm).map(stripEmojis)
    const headerHeight = Math.max(40, 20 + (metadataRows.length - 1) * 8)
    // ISSUE-013: the three payment columns (and the "Pagados" figure in the
    // stats line below) only ever appear for a payment_required event — a
    // free event's export stays byte-for-byte what it was before this issue.
    const showPaymentColumns = configForm.paymentRequired
    // ISSUE-018: independent of showPaymentColumns above — both can be true
    // at once (an event can require payment AND have check-in enabled), in
    // which case the checkin columns are appended AFTER the payment columns
    // (same left-to-right order as RsvpTable's Pago/Llegada columns).
    const showCheckinColumns = checkinEnabled

    // Header elegante
    doc.setFillColor(102, 102, 234) // Color morado del tema
    doc.rect(0, 0, 210, headerHeight, 'F')

    doc.setTextColor(255, 255, 255)
    metadataRows.forEach((row, index) => {
      doc.setFontSize(index === 0 ? 24 : 12)
      doc.setFont('helvetica', index === 0 ? 'bold' : 'normal')
      doc.text(row, 105, 18 + index * 8, { align: 'center' })
    })

    // Stats
    const statsY = headerHeight + 14
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    const paymentsStatsFragment = showPaymentColumns
      ? ` - Pagados: ${rsvpListView.paidPaymentsCount} (${formatAmountsCollected(rsvpListView.amountCollectedByCurrency)})`
      : ''
    doc.text(
      `Resultados: ${exportRsvps.length} - Confirmados: ${rsvpListView.confirmedTotal} - Pend. pago: ${rsvpListView.pendingPaymentTotal} - Pend. verificación: ${rsvpListView.pendingVerificationTotal} - Cancelados: ${rsvpListView.cancelledTotal} - Expirados: ${rsvpListView.expiredTotal}${paymentsStatsFragment}`,
      14,
      statsY,
    )

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    const summaryLines = doc.splitTextToSize(stripEmojis(exportSummary), 182) as string[]
    doc.text(summaryLines, 14, statsY + 6)

    // Tabla con datos - incluir filas para +1 con nombre si existe
    const tableData: (string | number)[][] = []
    exportRsvps.forEach((rsvp, index) => {
      // Fila principal del invitado
      const row: (string | number)[] = [
        index + 1,
        rsvpStatusLabel(rsvp.status),
        stripEmojis(rsvp.name),
        rsvp.email,
        rsvp.phone,
        rsvp.plusOne ? 'Si (+1)' : 'No',
        rsvp.emailSent ? new Date(rsvp.emailSent).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : 'No enviado'
      ]
      if (showPaymentColumns) {
        row.push(
          rsvp.paymentStatus ? stripEmojis(rsvpPaymentStatusLabel(rsvp.paymentStatus)) : 'Sin cargo',
          rsvp.paymentStatus && rsvp.amountCents != null && rsvp.currency
            ? stripEmojis(formatCentsAsCurrency(rsvp.amountCents, rsvp.currency))
            : '—',
          rsvp.paidAt
            ? new Date(rsvp.paidAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—',
        )
      }
      // ISSUE-018: "Llegó (hora)", "Llegada +1", "Marcó", "Nota check-in" —
      // only when this event's check-in portal is enabled.
      if (showCheckinColumns) {
        row.push(
          rsvp.checkedInAt
            ? new Date(rsvp.checkedInAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
            : 'Sin llegar',
          rsvp.plusOne
            ? (rsvp.plusOneCheckedInAt
              ? new Date(rsvp.plusOneCheckedInAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
              : 'Sin llegar')
            : '—',
          rsvp.checkedInBy ? stripEmojis(rsvp.checkedInBy) : '—',
          rsvp.checkinNote ? stripEmojis(rsvp.checkinNote) : '',
        )
      }
      tableData.push(row)
      // Si tiene +1 con nombre, agregar fila indentada
      if (rsvp.plusOne && rsvp.plusOneName) {
        const plusOneRow: (string | number)[] = [
          '',
          '',
          `   + ${stripEmojis(rsvp.plusOneName)}`,
          '',
          '',
          'Acomp.',
          ''
        ]
        if (showPaymentColumns) plusOneRow.push('', '', '')
        if (showCheckinColumns) plusOneRow.push('', '', '', '')
        tableData.push(plusOneRow)
      }
    })

    const paymentTableHead = ['Estado de pago', 'Monto', 'Fecha de pago']
    const checkinTableHead = ['Llegó (hora)', 'Llegada +1', 'Marcó', 'Nota check-in']
    const tableHead = [
      '#', 'Estado', 'Nombre', 'Email', 'Teléfono', '+1', 'Email',
      ...(showPaymentColumns ? paymentTableHead : []),
      ...(showCheckinColumns ? checkinTableHead : []),
    ]

    type PdfColumnStyle = { halign?: 'left' | 'center' | 'right' | 'justify'; cellWidth: number }
    // ISSUE-018: the narrower base-column widths (previously only used when
    // showPaymentColumns added its 3 columns) now apply whenever EITHER
    // extra column group is present, since both need the same page-width
    // budget freed up from the base columns.
    const hasExtraColumns = showPaymentColumns || showCheckinColumns
    const columnStyles: Record<number, PdfColumnStyle> = hasExtraColumns
      ? {
        0: { halign: 'center', cellWidth: 8 },
        1: { cellWidth: 18 },
        2: { cellWidth: 26 },
        3: { cellWidth: 32 },
        4: { cellWidth: 20 },
        5: { halign: 'center', cellWidth: 10 },
        6: { halign: 'center', cellWidth: 14 },
      }
      : {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 24 },
        2: { cellWidth: 34 },
        3: { cellWidth: 42 },
        4: { cellWidth: 28 },
        5: { halign: 'center', cellWidth: 18 },
        6: { halign: 'center', cellWidth: 26 }
      }

    let nextColumnIndex = 7
    if (showPaymentColumns) {
      columnStyles[nextColumnIndex++] = { cellWidth: 18 }
      columnStyles[nextColumnIndex++] = { halign: 'right', cellWidth: 16 }
      columnStyles[nextColumnIndex++] = { halign: 'center', cellWidth: 16 }
    }
    if (showCheckinColumns) {
      columnStyles[nextColumnIndex++] = { halign: 'center', cellWidth: 16 }
      columnStyles[nextColumnIndex++] = { halign: 'center', cellWidth: 16 }
      columnStyles[nextColumnIndex++] = { cellWidth: 16 }
      columnStyles[nextColumnIndex++] = { cellWidth: 22 }
    }

    autoTable(doc, {
      startY: statsY + 9 + summaryLines.length * 4,
      head: [tableHead],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [102, 102, 234],
        textColor: 255,
        fontSize: 10,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 9,
        cellPadding: 3
      },
      columnStyles,
      alternateRowStyles: {
        fillColor: [245, 245, 250]
      }
    })

    // Footer
    const pageCount = doc.getNumberOfPages()
    doc.setFontSize(8)
    doc.setTextColor(128, 128, 128)
    doc.text(
      `Generado el ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })} - Página ${pageCount}`,
      105,
      doc.internal.pageSize.height - 10,
      { align: 'center' }
    )

    const fileName = createEventExportFilename({
      slug: selectedEventId,
      title: configForm.title,
      subtitle: configForm.subtitle,
    }, 'pdf')
    doc.save(fileName)
  }

  // Exportar lista en Excel
  const exportExcelList = () => {
    const exportRsvps = rsvpListView.filteredAndSorted
    const exportSummary = describeRsvpListView(rsvpListOptions)
    // ISSUE-013: same gate as the PDF export above — a free event's Excel
    // export stays exactly what it was before this issue.
    const showPaymentColumns = configForm.paymentRequired
    // ISSUE-018: same independent gate as the PDF export above.
    const showCheckinColumns = checkinEnabled
    const paymentsStatsFragment = showPaymentColumns
      ? ` - Pagados: ${rsvpListView.paidPaymentsCount} (${formatAmountsCollected(rsvpListView.amountCollectedByCurrency)})`
      : ''

    // Crear datos para la hoja
    const wsData = [
      // Header rows con info del evento
      ...buildEventExportMetadataRows(configForm).map(row => [row]),
      [],
      [`Resultados: ${exportRsvps.length} - Confirmados: ${rsvpListView.confirmedTotal} - Pend. pago: ${rsvpListView.pendingPaymentTotal} - Pend. verificación: ${rsvpListView.pendingVerificationTotal} - Cancelados: ${rsvpListView.cancelledTotal} - Expirados: ${rsvpListView.expiredTotal}${paymentsStatsFragment}`],
      [exportSummary],
      [],
      // Header de tabla - con columna de Nombre del +1
      [
        '#', 'Estado', 'Nombre', 'Email', 'Teléfono', '+1', 'Nombre +1', 'Email Enviado',
        ...(showPaymentColumns ? ['Estado de pago', 'Monto', 'Fecha de pago'] : []),
        ...(showCheckinColumns ? ['Llegó (hora)', 'Llegada +1', 'Marcó', 'Nota check-in'] : []),
      ],
      // Datos
      ...exportRsvps.map((rsvp, index) => [
        index + 1,
        rsvpStatusLabel(rsvp.status),
        rsvp.name,
        rsvp.email,
        rsvp.phone,
        rsvp.plusOne ? 'Sí' : 'No',
        rsvp.plusOneName || '',
        rsvp.emailSent ? new Date(rsvp.emailSent).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : 'No enviado',
        ...(showPaymentColumns ? [
          rsvp.paymentStatus ? rsvpPaymentStatusLabel(rsvp.paymentStatus) : 'Sin cargo',
          rsvp.paymentStatus && rsvp.amountCents != null && rsvp.currency
            ? formatCentsAsCurrency(rsvp.amountCents, rsvp.currency)
            : '—',
          rsvp.paidAt
            ? new Date(rsvp.paidAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—',
        ] : []),
        // ISSUE-018: "Llegó (hora)", "Llegada +1", "Marcó", "Nota check-in".
        ...(showCheckinColumns ? [
          rsvp.checkedInAt
            ? new Date(rsvp.checkedInAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
            : 'Sin llegar',
          rsvp.plusOne
            ? (rsvp.plusOneCheckedInAt
              ? new Date(rsvp.plusOneCheckedInAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
              : 'Sin llegar')
            : '—',
          rsvp.checkedInBy || '—',
          rsvp.checkinNote || '',
        ] : []),
      ])
    ]

    // Crear workbook y worksheet
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Ajustar anchos de columna
    ws['!cols'] = [
      { wch: 5 },   // #
      { wch: 14 },  // Estado
      { wch: 30 },  // Nombre
      { wch: 35 },  // Email
      { wch: 18 },  // Teléfono
      { wch: 8 },   // +1
      { wch: 25 },  // Nombre +1
      { wch: 15 },  // Email Enviado
      ...(showPaymentColumns ? [
        { wch: 18 }, // Estado de pago
        { wch: 14 }, // Monto
        { wch: 14 }, // Fecha de pago
      ] : []),
      ...(showCheckinColumns ? [
        { wch: 14 }, // Llegó (hora)
        { wch: 14 }, // Llegada +1
        { wch: 16 }, // Marcó
        { wch: 30 }, // Nota check-in
      ] : []),
    ]

    // Agregar hoja al libro
    XLSX.utils.book_append_sheet(wb, ws, 'Invitados')

    // Generar archivo y descargar
    const fileName = createEventExportFilename({
      slug: selectedEventId,
      title: configForm.title,
      subtitle: configForm.subtitle,
    }, 'xlsx')
    XLSX.writeFile(wb, fileName)
  }

  // Stats
  const confirmedRsvps = rsvps.filter(r => r.status === 'confirmed')
  const stats = {
    total: rsvps.length,
    confirmed: confirmedRsvps.length,
    cancelled: rsvps.filter(r => r.status === 'cancelled').length,
    // ISSUE-006: separate counters — never folded into confirmed.
    pendingPayment: rsvps.filter(r => r.status === 'pending_payment').length,
    pendingVerification: rsvps.filter(r => r.status === 'pending_verification').length,
    expired: rsvps.filter(r => r.status === 'expired').length,
    plusOne: confirmedRsvps.filter(r => r.plusOne).length, // Solo +1 confirmados
    totalGuests: confirmedRsvps.length + confirmedRsvps.filter(r => r.plusOne).length,
    emailsSent: rsvps.filter(r => r.emailSent).length,
  }

  // ISSUE-018: whole-event counter (unfiltered `rsvps`, same scope as
  // `stats` above) — only ever shown when the event's check-in portal is
  // enabled.
  const checkinEnabled = selectedCheckinStatus?.enabled ?? false
  const checkinArrivalCount = computeCheckinArrivalCount(rsvps)

  // Prevent navigating to tabs the user shouldn't access
  useEffect(() => {
    if ((activeTab === 'eventos' || activeTab === 'usuarios') && currentUser?.role !== 'super_admin') {
      setActiveTab('dashboard')
    }
    if (activeTab === 'config' && !canManageSelectedEvent) {
      setActiveTab('dashboard')
    }
  }, [activeTab, canManageSelectedEvent, currentUser?.role])

  // While checking auth, show loading
  if (checkingAuth) {
    return <div className={styles.loadingContainer}>Validando sesión...</div>
  }

  // If not authenticated, the useEffect will redirect to /login
  if (!isAuthenticated) {
    return null
  }

  const plusOneLockMessage = editingRsvp
    ? plusOnePaymentLockMessage(editingRsvp.paymentStatus)
    : null

  return (
    <AdminShell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      canManageSelectedEvent={canManageSelectedEvent}
      isSuperAdmin={currentUser?.role === 'super_admin'}
      events={events}
      selectedEventId={selectedEventId}
      onSelectEvent={setSelectedEventId}
      homeEventId={homeEventId}
      onLogout={handleLogout}
      message={message}
    >
      {/* Contenido del Dashboard */}
      {activeTab === 'dashboard' && (
        <>
          <div className={styles.dashboardHeader}>
            <div>
              <p className={styles.dashboardEyebrow}>Evento seleccionado</p>
              <h2 className={styles.dashboardTitle}>{selectedEvent?.title || 'Resumen de invitados'}</h2>
              <p className={styles.dashboardDescription}>Consulta la asistencia y gestiona la lista de invitados.</p>
            </div>
            {canManageSelectedEvent && (
              <Button type="button" variant="primary" onClick={() => setActiveTab('config')}>
                <Settings size={17} />
                Configurar evento
              </Button>
            )}
          </div>

          {selectedEventId && (
            <CheckinOverview
              eventSlug={selectedEventId}
              status={selectedCheckinStatus}
              loading={selectedCheckinStatusLoading}
              error={selectedCheckinStatusError || undefined}
              arrived={checkinArrivalCount.arrived}
              totalSeats={checkinArrivalCount.totalSeats}
              onConfigure={canManageSelectedEvent ? () => openConfigSection('checkin') : undefined}
            />
          )}

          {/* H-008 FIX: Use extracted StatsCards component */}
          <StatsCards stats={stats} />

          {/* ISSUE-013: "N pagados · $X,XXX MXN recaudados" — only for a
              payment_required event, computed from the CURRENT filtered set
              (same scope as rsvpListView's other *Total counters). */}
          {configForm.paymentRequired && (
            <p className={styles.paymentsCollectedSummary}>
              {describePaymentsCollected(rsvpListView.paidPaymentsCount, rsvpListView.amountCollectedByCurrency)}
            </p>
          )}

          {/* ISSUE-018: "Llegados X / Confirmados Y" — only for a
              checkin_enabled event, computed from the WHOLE event roster
              (see checkinArrivalCount's doc comment), unlike the payment
              aggregate above which follows the current filtered set. */}
          {checkinEnabled && (
            <p className={styles.checkinArrivalSummary}>
              {describeCheckinArrivals(checkinArrivalCount)}
            </p>
          )}

          {/* Controles */}
          <RsvpFilters
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            displayFilterStatus={displayFilterStatus}
            onDisplayFilterStatusChange={setDisplayFilterStatus}
            displayFilterPlusOne={displayFilterPlusOne}
            onDisplayFilterPlusOneChange={setDisplayFilterPlusOne}
            displayFilterEmail={displayFilterEmail}
            onDisplayFilterEmailChange={setDisplayFilterEmail}
            sort={rsvpSort}
            onSortChange={setRsvpSort}
            pageSize={rsvpPageSize}
            onPageSizeChange={setRsvpPageSize}
            onExportPdf={exportInformativeList}
            onExportExcel={exportExcelList}
            exportDisabled={rsvpListView.total === 0}
            isReadOnly={isReadOnly}
            emailFilterStatus={emailFilterStatus}
            onEmailFilterStatusChange={setEmailFilterStatus}
            emailFilterEmail={emailFilterEmail}
            onEmailFilterEmailChange={setEmailFilterEmail}
            onSendBulkEmails={sendBulkEmails}
            bulkCount={emailTargetRsvps.length}
            bulkDisabled={loading || emailTargetRsvps.length === 0 || isEventPast()}
            eventPast={isEventPast()}
            showPaymentFilter={configForm.paymentRequired}
            displayFilterPayment={displayFilterPayment}
            onDisplayFilterPaymentChange={setDisplayFilterPayment}
          />

          {canManageSelectedEvent && selectedEventId && (
            <InvitationLinkManager eventSlug={selectedEventId} onNavigateToRsvp={navigateToRsvp} />
          )}

          <section className={styles.rsvpList} aria-label="Lista de invitados">
            <RsvpPagination
              position="top"
              page={rsvpListView.page}
              pageCount={rsvpListView.pageCount}
              rangeStart={rsvpListView.rangeStart}
              rangeEnd={rsvpListView.rangeEnd}
              resultCount={rsvpListView.total}
              onPreviousPage={() => setRsvpPage((page) => Math.max(1, page - 1))}
              onNextPage={() => setRsvpPage((page) => Math.min(rsvpListView.pageCount, page + 1))}
            />

            <RsvpTable
              variant="confirmed"
              rsvps={rsvpListView.pageItems.filter(r => r.status === 'confirmed')}
              totalCount={rsvpListView.confirmedTotal}
              isReadOnly={isReadOnly}
              loading={loading}
              isEventPast={isEventPast()}
              highlightedRsvpId={highlightedRsvpId}
              onSendEmail={sendEmail}
              onEdit={openEditModal}
              onToggleStatus={toggleStatus}
              showPayment={configForm.paymentRequired}
              showCheckin={checkinEnabled}
            />

            <RsvpTable
              variant="cancelled"
              rsvps={rsvpListView.pageItems.filter(r => r.status === 'cancelled')}
              totalCount={rsvpListView.cancelledTotal}
              isReadOnly={isReadOnly}
              loading={loading}
              isEventPast={isEventPast()}
              highlightedRsvpId={highlightedRsvpId}
              onSendEmail={sendEmail}
              onEdit={openEditModal}
              onToggleStatus={toggleStatus}
              showPayment={configForm.paymentRequired}
              showCheckin={checkinEnabled}
            />

            {/* ISSUE-006: pending/expired rows were previously fetched into
                `rsvps` but never rendered anywhere — silently invisible to
                admins even though they hold a reserved seat. Read-only
                actions (see RsvpTable's hasStatusActions): no send-email, no
                confirm/cancel toggle, since those flows belong to
                ISSUE-007/011 and must not be bypassed from here. */}
            <RsvpTable
              variant="pending_payment"
              rsvps={rsvpListView.pageItems.filter(r => r.status === 'pending_payment')}
              totalCount={rsvpListView.pendingPaymentTotal}
              isReadOnly={isReadOnly}
              loading={loading}
              isEventPast={isEventPast()}
              highlightedRsvpId={highlightedRsvpId}
              onSendEmail={sendEmail}
              onEdit={openEditModal}
              onToggleStatus={toggleStatus}
              showPayment={configForm.paymentRequired}
              showCheckin={checkinEnabled}
            />

            <RsvpTable
              variant="pending_verification"
              rsvps={rsvpListView.pageItems.filter(r => r.status === 'pending_verification')}
              totalCount={rsvpListView.pendingVerificationTotal}
              isReadOnly={isReadOnly}
              loading={loading}
              isEventPast={isEventPast()}
              highlightedRsvpId={highlightedRsvpId}
              onSendEmail={sendEmail}
              onEdit={openEditModal}
              onToggleStatus={toggleStatus}
              showPayment={configForm.paymentRequired}
              showCheckin={checkinEnabled}
            />

            <RsvpTable
              variant="expired"
              rsvps={rsvpListView.pageItems.filter(r => r.status === 'expired')}
              totalCount={rsvpListView.expiredTotal}
              isReadOnly={isReadOnly}
              loading={loading}
              isEventPast={isEventPast()}
              highlightedRsvpId={highlightedRsvpId}
              onSendEmail={sendEmail}
              onEdit={openEditModal}
              onToggleStatus={toggleStatus}
              showPayment={configForm.paymentRequired}
              showCheckin={checkinEnabled}
            />

            {rsvpListView.total === 0 && (
              <div className={styles.tableContainer}>
                <p className={styles.noData}>No hay RSVPs que coincidan con los filtros</p>
              </div>
            )}

            <RsvpPagination
              position="bottom"
              page={rsvpListView.page}
              pageCount={rsvpListView.pageCount}
              rangeStart={rsvpListView.rangeStart}
              rangeEnd={rsvpListView.rangeEnd}
              resultCount={rsvpListView.total}
              onPreviousPage={() => setRsvpPage((page) => Math.max(1, page - 1))}
              onNextPage={() => setRsvpPage((page) => Math.min(rsvpListView.pageCount, page + 1))}
            />
          </section>
        </>
      )}

      {/* Contenido de Configuración */}
      {activeTab === 'config' && canManageSelectedEvent && (
        <div className={`${styles.configContainer} ${styles.configPage}`}>
          <header className={styles.configHeader}>
            <div className={styles.configHeaderMain}>
              <div>
                <p className={styles.configEyebrow}>Backstage runbook · {selectedEvent?.title || 'Evento seleccionado'}</p>
                <h2>Configuración del evento</h2>
                <p className={styles.configDescription}>
                  Ajusta una etapa a la vez. Los cambios de check-in se aplican al momento; el resto se guarda con la barra inferior.
                </p>
              </div>
              {selectedEventId && (
                <a className={styles.configPreviewLink} href={`/${selectedEventId}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={16} />
                  Previsualizar invitación
                </a>
              )}
            </div>
            <BackstageStatusStrip
              rsvpClosed={configForm.rsvpClosed}
              paymentRequired={configForm.paymentRequired}
              priceAmount={configForm.priceAmount}
              checkinStatus={selectedCheckinStatus}
              checkinLoading={selectedCheckinStatusLoading}
            />
          </header>

          <ConfigNav activeSection={activeConfigSection} onSectionChange={selectConfigSection} />

          <form className={styles.configForm} onSubmit={saveEventConfig} noValidate>
              {activeConfigSection === 'checkin' && (
                <div
                  id="config-panel-checkin"
                  className={styles.configTabPanel}
                  role="tabpanel"
                  aria-labelledby="config-tab-checkin"
                  tabIndex={0}
                >
                  {selectedEventId && (
                    <div className={styles.configSection}>
                      <CheckinSettings
                        eventSlug={selectedEventId}
                        status={selectedCheckinStatus}
                        loadingStatus={selectedCheckinStatusLoading}
                        loadError={selectedCheckinStatusError || undefined}
                        onStatusChange={handleCheckinStatusChange}
                      />
                    </div>
                  )}
                </div>
              )}

              {activeConfigSection === 'general' && (
                <div
                  id="config-panel-general"
                  className={styles.configTabPanel}
                  role="tabpanel"
                  aria-labelledby="config-tab-general"
                  tabIndex={0}
                >
                  <SettingsDisclosure
                    title="Identidad del evento"
                    summary={configForm.displayTitle || configForm.title || 'Sin título visible'}
                    defaultOpen
                    revealKey={configValidationReveal.id === 'identity' ? configValidationReveal.nonce : 0}
                  >
                    <div className={styles.configFields}>
                      <div className={styles.configFormGroup}>
                        <label className={styles.configLabel} htmlFor="config-title">Nombre interno del evento *</label>
                        <input
                          id="config-title"
                          name="title"
                          type="text"
                          className={styles.configInput}
                          value={configForm.title}
                          onChange={(event) => setConfigForm({ ...configForm, title: event.target.value })}
                          placeholder="Ej. Fiesta de Navidad 2026"
                          autoComplete="off"
                          required
                        />
                        <p className={styles.configHelper}>Se usa en emails, exportaciones y administración.</p>
                      </div>

                      <div className={styles.configFormGroup}>
                        <label className={styles.configLabel} htmlFor="config-display-title">Título visible en la invitación</label>
                        <input
                          id="config-display-title"
                          name="displayTitle"
                          type="text"
                          className={styles.configInput}
                          value={configForm.displayTitle}
                          onChange={(event) => setConfigForm({ ...configForm, displayTitle: event.target.value })}
                          placeholder="Déjalo vacío para ocultar el título"
                          autoComplete="off"
                        />
                        <p className={styles.configHelper}>Útil cuando la imagen de fondo ya contiene el título.</p>
                      </div>

                      <div className={styles.configFormGroup}>
                        <label className={styles.configLabel} htmlFor="config-subtitle">Subtítulo</label>
                        <input
                          id="config-subtitle"
                          name="subtitle"
                          type="text"
                          className={styles.configInput}
                          value={configForm.subtitle}
                          onChange={(event) => setConfigForm({ ...configForm, subtitle: event.target.value })}
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  </SettingsDisclosure>

                  <SettingsDisclosure
                    title="Fecha y lugar"
                    summary={[configForm.date, configForm.time, configForm.location].filter(Boolean).join(' · ') || 'Sin logística pública'}
                    defaultOpen
                  >
                    <div className={styles.configFields}>
                      <div className={styles.configFormRow}>
                        <div className={styles.configFormGroup}>
                          <label className={styles.configLabel} htmlFor="config-date">Fecha</label>
                          <input
                            id="config-date"
                            name="date"
                            type="text"
                            className={styles.configInput}
                            value={configForm.date}
                            onChange={(event) => setConfigForm({ ...configForm, date: event.target.value })}
                            placeholder="Ej. Sábado 15 de febrero"
                            autoComplete="off"
                          />
                        </div>
                        <div className={styles.configFormGroup}>
                          <label className={styles.configLabel} htmlFor="config-time">Hora</label>
                          <input
                            id="config-time"
                            name="time"
                            type="text"
                            className={styles.configInput}
                            value={configForm.time}
                            onChange={(event) => setConfigForm({ ...configForm, time: event.target.value })}
                            placeholder="Ej. 7:00 PM"
                            autoComplete="off"
                          />
                        </div>
                      </div>

                      <div className={styles.configFormGroup}>
                        <label className={styles.configLabel} htmlFor="config-location">Ubicación</label>
                        <input
                          id="config-location"
                          name="location"
                          type="text"
                          className={styles.configInput}
                          value={configForm.location}
                          onChange={(event) => setConfigForm({ ...configForm, location: event.target.value })}
                          autoComplete="off"
                        />
                      </div>

                      <div className={styles.configFormGroup}>
                        <label className={styles.configLabel} htmlFor="config-details">Detalles adicionales</label>
                        <textarea
                          id="config-details"
                          name="details"
                          className={styles.configTextarea}
                          value={configForm.details}
                          onChange={(event) => setConfigForm({ ...configForm, details: event.target.value })}
                          rows={4}
                          placeholder="Descripción adicional del evento"
                        />
                      </div>
                    </div>
                  </SettingsDisclosure>
                </div>
              )}

              {activeConfigSection === 'guests' && (
                <div
                  id="config-panel-guests"
                  className={styles.configTabPanel}
                  role="tabpanel"
                  aria-labelledby="config-tab-guests"
                  tabIndex={0}
                >
                  <SettingsDisclosure
                    title="Cuota y cobro"
                    summary={configForm.paymentRequired
                      ? `$${configForm.priceAmount} MXN por persona · cobro requerido`
                      : configForm.priceEnabled ? `$${configForm.priceAmount} MXN informativos` : 'Sin cuota'}
                    defaultOpen
                    tone={configForm.paymentRequired ? 'warning' : 'default'}
                    revealKey={configValidationReveal.id === 'payment' ? configValidationReveal.nonce : 0}
                  >
                    <div className={styles.configFields}>
                      <div className={styles.configToggleGroup}>
                        <input
                          type="checkbox"
                          id="priceEnabled"
                          className={styles.configCheckbox}
                          checked={configForm.priceEnabled}
                          onChange={(event) => setConfigForm({
                            ...configForm,
                            priceEnabled: event.target.checked,
                            paymentRequired: event.target.checked ? configForm.paymentRequired : false,
                          })}
                        />
                        <label htmlFor="priceEnabled" className={styles.configToggleLabel}>Mostrar cuota de recuperación</label>
                      </div>

                      {configForm.priceEnabled && (
                        <div className={styles.configFormGroup}>
                          <label className={styles.configLabel} htmlFor="config-price-amount">Monto por persona (MXN) *</label>
                          <input
                            id="config-price-amount"
                            name="priceAmount"
                            type="number"
                            inputMode="numeric"
                            className={styles.configInput}
                            value={configForm.priceAmount}
                            onChange={(event) => {
                              const priceAmount = event.target.value === '' ? 0 : Number(event.target.value)
                              setConfigForm({
                                ...configForm,
                                priceAmount,
                                paymentRequired: Number.isInteger(priceAmount) && priceAmount > 0
                                  ? configForm.paymentRequired
                                  : false,
                              })
                            }}
                            min="0"
                            step="1"
                            required={configForm.priceEnabled}
                          />
                        </div>
                      )}

                      <div className={styles.configToggleGroup}>
                        <input
                          type="checkbox"
                          id="paymentRequired"
                          className={styles.configCheckbox}
                          checked={configForm.paymentRequired}
                          disabled={!configForm.priceEnabled || !configForm.priceAmount}
                          onChange={(event) => setConfigForm({ ...configForm, paymentRequired: event.target.checked })}
                        />
                        <label htmlFor="paymentRequired" className={styles.configToggleLabel}>Requerir pago para confirmar</label>
                      </div>
                      <p className={styles.configCallout} data-tone="payment">
                        {configForm.paymentRequired
                          ? `Stripe cobra $${configForm.priceAmount} MXN por persona. Si el invitado registra +1, paga 2 cuotas. Los links privados sin cortesía siguen la misma regla; los links de cortesía no pagan.`
                          : configForm.priceEnabled && configForm.priceAmount > 0
                            ? `La invitación mostrará una cuota de $${configForm.priceAmount} MXN por persona, pero no abrirá Checkout ni cobrará el +1.`
                            : 'Habilita una cuota mayor a $0 para poder requerir pago.'}
                      </p>
                      {configForm.paymentRequired && !stripeConfigured && (
                        <p className={styles.configCallout} data-tone="danger" role="alert">
                          Stripe no está configurado en este entorno. Los cobros fallarán hasta agregar STRIPE_SECRET_KEY.
                        </p>
                      )}
                    </div>
                  </SettingsDisclosure>

                  <SettingsDisclosure
                    title="Capacidad"
                    summary={configForm.capacityEnabled ? `${configForm.capacityLimit} lugares disponibles` : 'Sin límite visible'}
                    defaultOpen
                    revealKey={configValidationReveal.id === 'capacity' ? configValidationReveal.nonce : 0}
                  >
                    <div className={styles.configFields}>
                      <div className={styles.configToggleGroup}>
                        <input
                          type="checkbox"
                          id="capacityEnabled"
                          className={styles.configCheckbox}
                          checked={configForm.capacityEnabled}
                          onChange={(event) => setConfigForm({ ...configForm, capacityEnabled: event.target.checked })}
                        />
                        <label htmlFor="capacityEnabled" className={styles.configToggleLabel}>Limitar capacidad y mostrar cupo</label>
                      </div>
                      {configForm.capacityEnabled && (
                        <div className={styles.configFormGroup}>
                          <label className={styles.configLabel} htmlFor="config-capacity-limit">Límite de personas *</label>
                          <input
                            id="config-capacity-limit"
                            name="capacityLimit"
                            type="number"
                            inputMode="numeric"
                            className={styles.configInput}
                            value={configForm.capacityLimit}
                            onChange={(event) => setConfigForm({
                              ...configForm,
                              capacityLimit: event.target.value === '' ? 0 : Number(event.target.value),
                            })}
                            min="1"
                            step="1"
                            required={configForm.capacityEnabled}
                          />
                        </div>
                      )}
                    </div>
                  </SettingsDisclosure>

                  <SettingsDisclosure
                    title="Acompañantes (+1)"
                    summary={configForm.requirePlusOneName ? 'Nombre del acompañante requerido' : 'Nombre opcional'}
                  >
                    <div className={styles.configFields}>
                      <label className={styles.switchLabel}>
                        <input
                          type="checkbox"
                          className={styles.configCheckbox}
                          checked={configForm.requirePlusOneName}
                          onChange={(event) => setConfigForm({ ...configForm, requirePlusOneName: event.target.checked })}
                        />
                        <span>Requerir nombre del +1</span>
                      </label>
                      <p className={styles.configHelper}>
                        Los nombres aparecerán en la lista de invitados y en las exportaciones PDF y Excel.
                      </p>
                    </div>
                  </SettingsDisclosure>

                  <SettingsDisclosure
                    title="Disponibilidad del RSVP"
                    summary={configForm.rsvpClosed ? 'Registro cerrado' : 'Registro abierto'}
                    tone={configForm.rsvpClosed ? 'warning' : 'success'}
                  >
                    <div className={styles.configFields}>
                      <label className={styles.switchLabel}>
                        <input
                          type="checkbox"
                          className={styles.configCheckbox}
                          checked={configForm.rsvpClosed}
                          onChange={(event) => setConfigForm({ ...configForm, rsvpClosed: event.target.checked })}
                        />
                        <span>Cerrar periodo de RSVP</span>
                      </label>
                      <p className={styles.configHelper}>
                        La página pública mostrará un mensaje en lugar del formulario de registro.
                      </p>
                      {configForm.rsvpClosed && (
                        <div className={styles.configFormGroup}>
                          <label className={styles.configLabel} htmlFor="config-rsvp-closed-message">Mensaje cuando está cerrado</label>
                          <input
                            id="config-rsvp-closed-message"
                            name="rsvpClosedMessage"
                            type="text"
                            className={styles.configInput}
                            value={configForm.rsvpClosedMessage}
                            onChange={(event) => setConfigForm({ ...configForm, rsvpClosedMessage: event.target.value })}
                            placeholder="¡Nos vemos en el próximo evento!"
                            autoComplete="off"
                          />
                        </div>
                      )}
                    </div>
                  </SettingsDisclosure>
                </div>
              )}

              {activeConfigSection === 'design' && (
                <div
                  id="config-panel-design"
                  className={styles.configTabPanel}
                  role="tabpanel"
                  aria-labelledby="config-tab-design"
                  tabIndex={0}
                >
                  <SettingsDisclosure
                    title="Presentación pública"
                    summary={`${configForm.presentationMode === 'artwork_only' ? 'Solo imagen + RSVP' : configForm.presentationMode === 'modern_details' ? 'Moderna con información' : 'Clásica'} · ${configForm.backgroundImageFit === 'contain' ? 'imagen completa' : 'cubrir pantalla'}`}
                    defaultOpen
                    revealKey={configValidationReveal.id === 'presentation' ? configValidationReveal.nonce : 0}
                  >
                    <EventPresentationSettings
                      value={{
                        presentationMode: configForm.presentationMode,
                        rsvpTitle: configForm.rsvpTitle,
                        rsvpButtonLabel: configForm.rsvpButtonLabel,
                        backgroundOverlayStrength: configForm.backgroundOverlayStrength,
                        backgroundImageFit: configForm.backgroundImageFit,
                        backgroundImagePosition: configForm.backgroundImagePosition,
                      }}
                      onChange={(presentation) => setConfigForm(current => ({ ...current, ...presentation }))}
                      backgroundColor={configForm.backgroundColor}
                      backgroundImageUrl={configForm.backgroundImage}
                      onBackgroundColorChange={(backgroundColor) => setConfigForm(current => ({ ...current, backgroundColor }))}
                    />
                  </SettingsDisclosure>

                  <SettingsDisclosure
                    title="Imagen de fondo"
                    summary={configForm.backgroundImage ? 'Imagen configurada' : 'Sin imagen'}
                  >
                    <div className={styles.configFields}>
                      <div className={styles.imageMethodTabs} aria-label="Origen de la imagen de fondo">
                        <button
                          type="button"
                          aria-pressed={imageMethod === 'url'}
                          className={`${styles.imageMethodTab} ${imageMethod === 'url' ? styles.imageMethodTabActive : ''}`}
                          onClick={() => setImageMethod('url')}
                        >
                          Usar URL
                        </button>
                        <button
                          type="button"
                          aria-pressed={imageMethod === 'upload'}
                          className={`${styles.imageMethodTab} ${imageMethod === 'upload' ? styles.imageMethodTabActive : ''}`}
                          onClick={() => setImageMethod('upload')}
                        >
                          Subir archivo
                        </button>
                      </div>
                      {imageMethod === 'url' ? (
                        <div className={styles.configFormGroup}>
                          <label className={styles.configLabel} htmlFor="config-background-image">URL de la imagen</label>
                          <input
                            id="config-background-image"
                            name="backgroundImage"
                            type="url"
                            className={styles.configInput}
                            value={configForm.backgroundImage}
                            onChange={(event) => setConfigForm({ ...configForm, backgroundImage: event.target.value })}
                            placeholder="/background.png o https://ejemplo.com/imagen.jpg"
                            autoComplete="off"
                          />
                          <p className={styles.configHelper}>Pega una URL externa o una ruta relativa del proyecto.</p>
                        </div>
                      ) : (
                        <div className={styles.configFormGroup}>
                          <input
                            id="config-background-file"
                            name="backgroundFile"
                            type="file"
                            ref={fileInputRef}
                            className={styles.hiddenFileInput}
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            onChange={handleFileChange}
                          />
                          <label
                            htmlFor="config-background-file"
                            className={`${styles.uploadZone} ${isUploading ? styles.uploadZoneActive : ''}`}
                          >
                            <span className={styles.uploadZoneIcon} aria-hidden="true">▧</span>
                            <span className={styles.uploadZoneText}>{isUploading ? 'Subiendo imagen…' : 'Seleccionar imagen de fondo'}</span>
                            <span className={styles.uploadZoneHint}>JPG, PNG, WebP o GIF · máximo 10 MB</span>
                          </label>
                          {isUploading && <p className={styles.uploadProgressText} role="status">Subiendo imagen…</p>}
                          {uploadError && <p className={styles.uploadError} role="alert">{uploadError}</p>}
                        </div>
                      )}
                    </div>
                  </SettingsDisclosure>

                  <SettingsDisclosure
                    title="Imagen para compartir"
                    summary={configForm.ogImage ? 'OG 1200 × 630 configurada' : 'Usará el respaldo automático'}
                  >
                    <div className={styles.configFields}>
                      <p className={styles.configHelper}>Aparece al compartir en WhatsApp, Facebook y otras redes. Recomendado: 1200 × 630 px.</p>
                      <div className={styles.imageMethodTabs} aria-label="Origen de la imagen para compartir">
                        <button
                          type="button"
                          aria-pressed={ogImageMethod === 'url'}
                          className={`${styles.imageMethodTab} ${ogImageMethod === 'url' ? styles.imageMethodTabActive : ''}`}
                          onClick={() => setOgImageMethod('url')}
                        >
                          Usar URL
                        </button>
                        <button
                          type="button"
                          aria-pressed={ogImageMethod === 'upload'}
                          className={`${styles.imageMethodTab} ${ogImageMethod === 'upload' ? styles.imageMethodTabActive : ''}`}
                          onClick={() => setOgImageMethod('upload')}
                        >
                          Subir archivo
                        </button>
                      </div>
                      {ogImageMethod === 'url' ? (
                        <div className={styles.configFormGroup}>
                          <label className={styles.configLabel} htmlFor="config-og-image">URL de la imagen para compartir</label>
                          <input
                            id="config-og-image"
                            name="ogImage"
                            type="url"
                            className={styles.configInput}
                            value={configForm.ogImage}
                            onChange={(event) => setConfigForm({ ...configForm, ogImage: event.target.value })}
                            placeholder="https://ejemplo.com/imagen-1200x630.jpg"
                            autoComplete="off"
                          />
                        </div>
                      ) : (
                        <div className={styles.configFormGroup}>
                          <input
                            id="config-og-file"
                            name="ogFile"
                            type="file"
                            ref={ogFileInputRef}
                            className={styles.hiddenFileInput}
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleOgFileChange}
                          />
                          <label
                            htmlFor="config-og-file"
                            className={`${styles.uploadZone} ${isUploadingOg ? styles.uploadZoneActive : ''}`}
                          >
                            <span className={styles.uploadZoneIcon} aria-hidden="true">▧</span>
                            <span className={styles.uploadZoneText}>{isUploadingOg ? 'Subiendo imagen…' : 'Seleccionar imagen 1200 × 630'}</span>
                            <span className={styles.uploadZoneHint}>JPG, PNG o WebP · máximo 10 MB</span>
                          </label>
                          {isUploadingOg && <p className={styles.uploadProgressText} role="status">Subiendo imagen…</p>}
                          {uploadErrorOg && <p className={styles.uploadError} role="alert">{uploadErrorOg}</p>}
                        </div>
                      )}
                      {configForm.ogImage && (
                        <ImagePreview src={configForm.ogImage} alt="Vista previa para compartir" aspectRatio="1200/630" dimensionsLabel="1200 × 630" />
                      )}
                      <p className={styles.configHelper}>Si está vacía, se usa la imagen de fondo o un respaldo generado.</p>
                    </div>
                  </SettingsDisclosure>

                  <SettingsDisclosure
                    title="Colores del tema"
                    summary={`${configForm.primaryColor} · ${configForm.secondaryColor} · ${configForm.accentColor}`}
                  >
                    <div className={styles.configFields}>
                      <div className={styles.configColorGrid}>
                        {([
                          ['primaryColor', 'Color primario', configForm.primaryColor],
                          ['secondaryColor', 'Color secundario', configForm.secondaryColor],
                          ['accentColor', 'Color de acento', configForm.accentColor],
                        ] as const).map(([key, label, value]) => (
                          <div className={styles.configFormGroup} key={key}>
                            <label className={styles.configLabel} htmlFor={`config-${key}`}>{label}</label>
                            <div className={styles.configColorControl}>
                              <input
                                id={`config-${key}`}
                                type="color"
                                className={styles.configColorPicker}
                                value={value}
                                onChange={(event) => setConfigForm({ ...configForm, [key]: event.target.value })}
                                aria-label={`Seleccionar ${label.toLowerCase()}`}
                              />
                              <input
                                type="text"
                                className={styles.configInput}
                                value={value}
                                onChange={(event) => setConfigForm({ ...configForm, [key]: event.target.value })}
                                aria-label={`${label} en formato HEX`}
                                pattern="^#[0-9A-Fa-f]{6}$"
                                maxLength={7}
                                spellCheck={false}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className={styles.themePreview} style={{ backgroundColor: configForm.backgroundColor }} aria-label="Vista previa de colores">
                        <span style={{ color: configForm.primaryColor }}>TÍTULO</span>
                        <span style={{ color: configForm.secondaryColor }}>Subtítulo</span>
                        <span
                          className={styles.themePreviewButton}
                          style={{
                            background: configForm.presentationMode === 'classic'
                              ? `linear-gradient(135deg, ${configForm.primaryColor}, ${configForm.secondaryColor})`
                              : configForm.primaryColor,
                          }}
                        >
                          CONFIRMAR
                        </span>
                        <span style={{ color: configForm.accentColor }}>RSVP INDISPENSABLE</span>
                      </div>
                    </div>
                  </SettingsDisclosure>
                </div>
              )}

              {activeConfigSection === 'messages' && (
                <div
                  id="config-panel-messages"
                  className={styles.configTabPanel}
                  role="tabpanel"
                  aria-labelledby="config-tab-messages"
                  tabIndex={0}
                >
                  <SettingsDisclosure
                    title="Confirmación y verificación"
                    summary={`${configForm.emailConfirmationEnabled ? 'Confirmación automática' : 'Confirmación manual'} · ${configForm.emailVerificationEnabled ? 'verificación activa' : 'sin verificación'}`}
                    defaultOpen
                  >
                    <div className={styles.configFields}>
                      <div className={styles.configToggleGroup}>
                        <input
                          type="checkbox"
                          id="emailConfirmationEnabled"
                          className={styles.configCheckbox}
                          checked={configForm.emailConfirmationEnabled}
                          onChange={(event) => setConfigForm({ ...configForm, emailConfirmationEnabled: event.target.checked })}
                        />
                        <label htmlFor="emailConfirmationEnabled" className={styles.configToggleLabel}>Enviar confirmación automática</label>
                      </div>
                      <p className={styles.configHelper}>
                        {configForm.emailConfirmationEnabled
                          ? 'Se enviará un email cuando alguien confirme su asistencia.'
                          : 'Las confirmaciones se enviarán manualmente desde el dashboard.'}
                      </p>

                      <div className={styles.configToggleGroup}>
                        <input
                          type="checkbox"
                          id="emailVerificationEnabled"
                          className={styles.configCheckbox}
                          checked={configForm.emailVerificationEnabled}
                          onChange={(event) => setConfigForm({ ...configForm, emailVerificationEnabled: event.target.checked })}
                        />
                        <label htmlFor="emailVerificationEnabled" className={styles.configToggleLabel}>Verificación por email</label>
                      </div>
                      <p className={styles.configHelper}>
                        El invitado debe confirmar su correo. Los links privados pueden omitirla; en eventos de pago, el pago verifica el correo.
                      </p>
                    </div>
                  </SettingsDisclosure>

                  <SettingsDisclosure
                    title="Recordatorio automático"
                    summary={configForm.reminderEnabled && configForm.reminderScheduledAt
                      ? `Programado: ${new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(configForm.reminderScheduledAt))}`
                      : 'Sin recordatorio programado'}
                    defaultOpen
                    tone={configForm.reminderEnabled ? 'success' : 'default'}
                    revealKey={configValidationReveal.id === 'reminder' ? configValidationReveal.nonce : 0}
                  >
                    <div className={styles.configFields}>
                      <div className={styles.configToggleGroup}>
                        <input
                          type="checkbox"
                          id="reminderEnabled"
                          className={styles.configCheckbox}
                          checked={configForm.reminderEnabled}
                          onChange={(event) => setConfigForm({
                            ...configForm,
                            reminderEnabled: event.target.checked,
                            reminderScheduledAt: event.target.checked ? configForm.reminderScheduledAt : '',
                          })}
                        />
                        <label htmlFor="reminderEnabled" className={styles.configToggleLabel}>Programar recordatorio automático</label>
                      </div>
                      {configForm.reminderEnabled && (
                        <div className={styles.configFormGroup}>
                          <label className={styles.configLabel} htmlFor="config-reminder-at">Fecha y hora del recordatorio *</label>
                          <input
                            id="config-reminder-at"
                            name="reminderScheduledAt"
                            type="datetime-local"
                            className={styles.configInput}
                            value={configForm.reminderScheduledAt}
                            onChange={(event) => setConfigForm({ ...configForm, reminderScheduledAt: event.target.value })}
                            required
                          />
                          <p className={styles.configHelper}>Se envía automáticamente a todos los confirmados.</p>
                        </div>
                      )}
                      {configForm.reminderSentAt && (
                        <p className={styles.configCallout} data-tone="success">
                          Último recordatorio enviado el {new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(configForm.reminderSentAt))}.
                        </p>
                      )}
                      <p className={styles.configCallout} data-tone="note">
                        Los recordatorios solo se envían a invitados confirmados de este evento. Los cancelados no los reciben.
                      </p>
                      <ReminderStatusSection eventSlug={selectedEventId} />
                    </div>
                  </SettingsDisclosure>
                </div>
              )}

              <SaveBar saving={loading} statusLabel={message || undefined} />
          </form>
        </div>
      )}

      {/* Contenido de Eventos */}
      {activeTab === 'eventos' && currentUser?.role === 'super_admin' && (
        <div className={styles.configContainer}>
          <h2>🎉 Gestión de Eventos</h2>
          <p className={styles.configDescription}>
            Crea y administra múltiples fiestas. Cada evento tiene su propia página de invitación y lista de RSVPs.
          </p>

          {/* Lista de eventos existentes */}
          <div style={{ marginBottom: '30px' }}>
            <h3 style={{ marginBottom: '15px' }}>📋 Eventos Existentes</h3>
            {events.length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic' }}>No hay eventos creados aún. ¡Crea tu primera fiesta!</p>
            ) : (
              <div style={{ display: 'grid', gap: '15px' }}>
                {events.map((evt) => (
                  <div key={evt.id} style={{
                    padding: '15px 20px',
                    background: evt.isActive ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#ddd',
                    borderRadius: '10px',
                    color: evt.isActive ? 'white' : '#666',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}>
                    <div>
                      <strong style={{ fontSize: '18px' }}>{evt.title}</strong>
                      {evt.subtitle && <span> - {evt.subtitle}</span>}
                      <div style={{ fontSize: '14px', opacity: 0.9, marginTop: '5px' }}>
                        📅 {evt.date} | 📍 {evt.location} | 🔗 /{evt.slug}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <a
                        href={`/${evt.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '8px 15px',
                          background: 'rgba(255,255,255,0.2)',
                          color: 'inherit',
                          borderRadius: '6px',
                          textDecoration: 'none',
                          border: '1px solid currentColor'
                        }}
                      >
                        Ver Página
                      </a>
                      <button
                        onClick={() => {
                          // Always store the slug in state to keep selector + API calls consistent
                          setSelectedEventId(evt.slug)
                          loadRSVPs(evt.slug)
                        }}
                        style={{
                          padding: '8px 15px',
                          background: 'white',
                          color: '#667eea',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        Ver RSVPs
                      </button>
                      <button
                        onClick={() => openEditSlugModal(evt)}
                        style={{
                          padding: '8px 15px',
                          background: 'rgba(255,215,0,0.3)',
                          color: 'inherit',
                          borderRadius: '6px',
                          border: '1px solid #FFD700',
                          cursor: 'pointer',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                        title="Editar slug (URL)"
                      >
                        ✏️ Slug
                      </button>
                      <button
                        onClick={() => evt.id && setAsHome(evt.id)}
                        disabled={homeEventId === evt.id}
                        style={{
                          padding: '8px 15px',
                          background: homeEventId === evt.id ? '#10b981' : 'rgba(255,255,255,0.2)',
                          color: homeEventId === evt.id ? 'white' : 'inherit',
                          borderRadius: '6px',
                          border: homeEventId === evt.id ? 'none' : '1px solid currentColor',
                          cursor: homeEventId === evt.id ? 'default' : 'pointer',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        {homeEventId === evt.id ? '🏠 Home Page' : 'Set as Home'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>


          {/* Formulario para crear nuevo evento */}
          <div style={{ borderTop: '2px solid #eee', paddingTop: '30px' }}>
            <h3 style={{ marginBottom: '20px' }}>➕ Crear Nuevo Evento</h3>
            <form onSubmit={async (e) => {
              e.preventDefault()
              const form = e.target as HTMLFormElement
              const formData = new FormData(form)

              try {
                setLoading(true)
                const response = await fetch('/api/events', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    slug: formData.get('slug'),
                    title: formData.get('title'),
                    subtitle: formData.get('subtitle'),
                    date: formData.get('date'),
                    time: formData.get('time'),
                    location: formData.get('location'),
                    details: formData.get('details'),
                  })
                })

                const data = await response.json()
                if (data.success) {
                  setMessage('✅ ¡Evento creado exitosamente!')
                  form.reset()
                  await loadEvents()
                  if (data.event?.slug) {
                    setSelectedEventId(data.event.slug)
                    setActiveTab('config')
                  }
                } else {
                  setMessage(`❌ Error: ${data.error}`)
                }
              } catch (error) {
                setMessage('❌ Error al crear evento')
              } finally {
                setLoading(false)
              }
            }} style={{ display: 'grid', gap: '15px', maxWidth: '600px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Slug (URL) *</label>
                <input
                  name="slug"
                  type="text"
                  pattern="[a-z0-9-]+"
                  required
                  placeholder="mi-fiesta-2025"
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '16px' }}
                />
                <small style={{ color: '#666' }}>Solo letras minúsculas, números y guiones. Ej: fiesta-enero</small>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Nombre interno del evento *</label>
                  <input name="title" type="text" required placeholder="Party Time!" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '16px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Subtítulo</label>
                  <input name="subtitle" type="text" placeholder="ENERO 2025" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '16px' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Fecha (opcional)</label>
                  <input name="date" type="text" placeholder="SÁBADO, 15 ENE" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '16px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Hora (opcional)</label>
                  <input name="time" type="text" placeholder="DESDE LAS 7:00 PM" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '16px' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Ubicación (opcional)</label>
                <input name="location" type="text" placeholder="HAMBURGO 108, ZONA ROSA" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '16px' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Detalles</label>
                <textarea name="details" rows={3} placeholder="🍺 Chelas incluidas..." style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '16px' }} />
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '15px 30px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? 'Creando...' : '🎉 Crear Evento'}
              </button>
            </form>
          </div>
        </div>
      )}

      {editingRsvp && (
        <div className={styles.editModal} onClick={closeEditModal}>
          <div className={styles.editModalCard} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.editModalTitle}>Editar Confirmación</h2>
            <form className={styles.editForm} onSubmit={(e) => { e.preventDefault(); saveEdit(); }}>
              <div className={styles.editFormGroup}>
                <label className={styles.editFormLabel}>Nombre *</label>
                <input
                  type="text"
                  className={styles.editFormInput}
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </div>
              <div className={styles.editFormGroup}>
                <label className={styles.editFormLabel}>Email *</label>
                <input
                  type="email"
                  className={styles.editFormInput}
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  required
                />
              </div>
              <div className={styles.editFormGroup}>
                <label className={styles.editFormLabel}>Teléfono *</label>
                <PhoneInput
                  defaultCountry="mx"
                  value={editForm.phone}
                  onChange={(phone) => setEditForm({ ...editForm, phone })}
                  className={styles.editFormPhoneInput}
                  inputClassName={styles.editFormPhoneInputField}
                  countrySelectorStyleProps={{
                    buttonClassName: styles.editFormCountrySelector
                  }}
                />
              </div>
              <div className={styles.editFormGroup}>
                <div className={styles.editFormCheckboxGroup}>
                  <input
                    type="checkbox"
                    id="editPlusOne"
                    className={styles.editFormCheckbox}
                    checked={editForm.plusOne}
                    disabled={Boolean(plusOneLockMessage)}
                    aria-describedby={plusOneLockMessage ? 'edit-plus-one-payment-lock' : undefined}
                    onChange={(e) => setEditForm({ ...editForm, plusOne: e.target.checked, plusOneName: e.target.checked ? editForm.plusOneName : '' })}
                  />
                  <label htmlFor="editPlusOne" className={styles.editFormLabel}>+1 Acompañante</label>
                </div>
                {plusOneLockMessage && (
                  <p id="edit-plus-one-payment-lock" className={styles.editFormLockedNote} role="note">
                    {plusOneLockMessage}
                  </p>
                )}
                {editForm.plusOne && (
                  <input
                    type="text"
                    className={styles.editFormInput}
                    value={editForm.plusOneName}
                    onChange={(e) => setEditForm({ ...editForm, plusOneName: e.target.value })}
                    placeholder="Nombre del acompañante (opcional)"
                    style={{ marginTop: '10px' }}
                  />
                )}
              </div>
              <div className={styles.editFormButtons}>
                <button
                  type="button"
                  className={styles.editFormCancelBtn}
                  onClick={closeEditModal}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={styles.editFormSaveBtn}
                  disabled={loading}
                >
                  {loading ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contenido de Usuarios (solo super_admin) */}
      {activeTab === 'usuarios' && currentUser?.role === 'super_admin' && (
        <UserManagement events={events} />
      )}

      {activeTab === 'cuenta' && currentUser && (
        <section className={styles.accountContainer} aria-labelledby="account-password-title">
          <h2 id="account-password-title">🔐 Seguridad de la cuenta</h2>
          <p>
            Actualiza tu contraseña. Al guardarla, las demás sesiones de tu cuenta se cerrarán automáticamente.
          </p>
          <ChangePasswordForm isEnvironmentAdmin={currentUser.id === 'super_admin_env'} />
        </section>
      )}

      {currentUser?.mustChangePassword && (
        <ForcedPasswordChangeDialog
          onSuccess={() => setCurrentUser(user => user ? { ...user, mustChangePassword: false } : user)}
        />
      )}

      {/* Modal de edición de slug */}
      {editingSlugEvent && (
        <div className={styles.editModal} onClick={closeEditSlugModal}>
          <div className={styles.editModalCard} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.editModalTitle}>✏️ Editar Slug (URL)</h2>
            <p style={{ marginBottom: '20px', color: '#666', fontSize: '14px' }}>
              Cambiar el slug modificará la URL del evento y actualizará todas las referencias incluyendo los RSVPs.
            </p>

            <div style={{ marginBottom: '20px', padding: '15px', background: '#f0f4ff', borderRadius: '8px' }}>
              <strong>Evento:</strong> {editingSlugEvent.title}
              <br />
              <strong>URL actual:</strong> <code style={{ background: '#e0e7ff', padding: '2px 6px', borderRadius: '4px' }}>/{editingSlugEvent.slug}</code>
            </div>

            <form className={styles.editForm} onSubmit={(e) => { e.preventDefault(); saveNewSlug(); }}>
              <div className={styles.editFormGroup}>
                <label className={styles.editFormLabel}>Nuevo Slug *</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ color: '#666', fontSize: '16px' }}>/</span>
                  <input
                    type="text"
                    className={styles.editFormInput}
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="mi-nuevo-slug"
                    pattern="[a-z0-9-]+"
                    required
                    autoFocus
                    style={{ flex: 1 }}
                  />
                </div>
                <small style={{ color: '#888', marginTop: '5px', display: 'block' }}>
                  Solo letras minúsculas, números y guiones (-)
                </small>
              </div>

              {newSlug && newSlug !== editingSlugEvent.slug && (
                <div style={{
                  marginBottom: '15px',
                  padding: '12px',
                  background: '#fff3cd',
                  borderRadius: '8px',
                  border: '1px solid #ffc107'
                }}>
                  <strong>⚠️ Advertencia:</strong>
                  <ul style={{ margin: '8px 0 0 20px', fontSize: '14px' }}>
                    <li>La URL cambiará de <code>/{editingSlugEvent.slug}</code> a <code>/{newSlug}</code></li>
                    <li>Los enlaces compartidos anteriormente dejarán de funcionar</li>
                    <li>La metadata para redes sociales se actualizará automáticamente</li>
                    <li>Todos los RSVPs serán actualizados al nuevo slug</li>
                    <li>Las imágenes OG personalizadas (<code>og-{editingSlugEvent.slug}.*</code>) serán renombradas</li>
                  </ul>
                </div>
              )}

              <div className={styles.editFormButtons}>
                <button
                  type="button"
                  className={styles.editFormCancelBtn}
                  onClick={closeEditSlugModal}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={styles.editFormSaveBtn}
                  disabled={loading || !newSlug || newSlug === editingSlugEvent.slug}
                >
                  {loading ? 'Guardando...' : '💾 Cambiar Slug'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminShell>
  )
}
