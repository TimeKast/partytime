# 🎬 YaLaVi Visual Redesign Proposal — "Cinematic UI"

## 📋 Current State Analysis

**Stack actual:**

- Next.js 16 + React 19
- Tailwind v4
- Framer Motion (instalado pero sub-utilizado)
- Shadcn/ui (base sólida)

**Páginas:**

- Dashboard
- Series Grid (catálogo)
- Series Detail
- Mi Lista
- Importar
- Perfil
- Notificaciones
- Settings

**Problema actual:** La UI es funcional pero genérica — no "siente" como una app de streaming/TV.

---

## 🎯 Vision: "Cinematic UI"

Transformar YaLaVi en una experiencia **inmersiva tipo streaming platform** con:

- Animaciones fluidas cinematográficas
- Hero sections dinámicos
- Cards con depth y parallax
- Micro-interacciones premium
- Transiciones escena-por-escena

**Mantener:** Los colores actuales (brand identity)
**Cambiar:** TODO lo demás — layout, animaciones, transiciones, profundidad

---

## 📚 Recommended Libraries

### Core Animation Libraries

| Librería               | Uso Principal                        | Instalación                            |
| ---------------------- | ------------------------------------ | -------------------------------------- |
| **ReactBits**          | Componentes animados pre-construidos | `npx reactbits@latest add <component>` |
| **Aceternity UI**      | Efectos hero, cards 3D, spotlight    | Copiar componentes                     |
| **Magic UI**           | Background effects, marquee, borders | `npx magicui-cli add <component>`      |
| **Framer Motion** ✅   | Animaciones custom (YA INSTALADO)    | Usar más                               |
| **GSAP + @gsap/react** | Animaciones complejas, timeline      | `pnpm add gsap`                        |
| **Lenis**              | Smooth scroll premium                | `pnpm add lenis`                       |
| **Theater.js**         | Orquestación de animaciones          | Opcional                               |

### Component Libraries (Copy/Paste)

| Librería      | URL               | Mejores componentes para YaLaVi                                |
| ------------- | ----------------- | -------------------------------------------------------------- |
| ReactBits     | reactbits.dev     | SpotlightCard, AnimatedList, TextReveal, Parallax              |
| Aceternity UI | ui.aceternity.com | 3D Card Effect, Spotlight, Hover Border Gradient, Tracing Beam |
| Magic UI      | magicui.design    | Shimmer Button, Meteors, Aurora, Animated Gradient             |
| Animata       | animata.design    | Scroll-based animations, Reveal effects                        |
| Kokonut UI    | kokonutui.com     | Modern cards, Navigation                                       |
| Linear Clone  | linear.app Clone  | Issue tracking UI patterns                                     |

---

## 🎨 Component Transformation Plan

### Phase 1: Foundation (Week 1-2)

#### 1.1 Layout & Navigation

```
BEFORE: Standard sidebar + header
AFTER:  Floating navigation with blur backdrop
```

**Componentes nuevos:**

- `FloatingNav` — Navbar glassmorphism con hide-on-scroll
- `SidebarDrawer` — Drawer animado con Framer Motion
- `PageTransition` — Wrapper para transiciones entre páginas

**Librerías:**

- Aceternity: `FloatingNavbar`, `Sidebar`
- Framer Motion: `AnimatePresence`, `motion` components

#### 1.2 Background System

```
BEFORE: Solid background
AFTER:  Dynamic ambient backgrounds
```

**Componentes nuevos:**

- `AmbientBackground` — Gradientes animados tipo Apple TV
- `GridPattern` — Dot grid sutil
- `Vortex` — Efecto vortex/aurora

**Librerías:**

- Magic UI: `Aurora`, `Meteors`
- Aceternity: `Vortex`
- Custom: CSS gradients with animation

---

### Phase 2: Series Cards (Week 2-3)

#### 2.1 Hero Card (Featured Series)

```
BEFORE: Static card grid
AFTER:  Cinematic hero with parallax + spotlight
```

**Componentes nuevos:**

- `HeroSection` — Banner principal con blur gradient
- `FeaturedSeries` — Serie destacada con Ken Burns effect
- `SpotlightCard` — Card con spotlight cursor tracking

**Efectos:**

- Ken Burns (zoom + pan lento en imagen)
- Spotlight que sigue el cursor
- Glow gradient en edges
- Rating badge animado

**Librerías:**

- ReactBits: `SpotlightCard`, `AnimatedContent`
- Aceternity: `3D Card Effect`
- Framer Motion: Parallax scroll

#### 2.2 Series Grid Card

```
BEFORE: Flat card with hover scale
AFTER:  3D tilt card with depth layers
```

**Componentes nuevos:**

- `SeriesCard3D` — Tilt effect en hover
- `CardGlare` — Efecto de luz/reflejo
- `ProgressRing` — Progreso de visualización circular

**Efectos:**

- 3D tilt seguimiento mouse
- Glare/sheen animation
- Stats overlay con fade
- Skeleton loading shimmer

**Librerías:**

- Aceternity: `3D Card Effect`
- Magic UI: `Shimmer`
- Custom: CSS 3D transforms

---

### Phase 3: Series Detail Page (Week 3-4)

#### 3.1 Hero Detail

```
BEFORE: Basic info section
AFTER:  Full-screen hero with backdrop
```

**Componentes nuevos:**

- `BackdroHero` — Imagen de fondo fullscreen blur
- `InfoOverlay` — Info con glassmorphism
- `ActionButtonGroup` — Botones animados

**Efectos:**

- Backdrop con blur + gradient
- Text reveal animation
- Buttons con shine effect
- Scroll-triggered parallax

#### 3.2 Episode List

```
BEFORE: Simple list
AFTER:  Animated timeline/list
```

**Componentes nuevos:**

- `EpisodeTimeline` — Lista con línea conectora
- `EpisodeCard` — Card expandible
- `WatchProgress` — Barra de progreso animada

**Efectos:**

- Stagger animation en load
- Expand/collapse smooth
- Progress bar con glow

**Librerías:**

- ReactBits: `AnimatedList`
- Framer Motion: `layout` animations

---

### Phase 4: Dashboard (Week 4-5)

#### 4.1 Stats Widgets

```
BEFORE: Basic stat cards
AFTER:  Animated metric displays
```

**Componentes nuevos:**

- `MetricCard` — Números que cuentan up
- `ProgressGauge` — Gauge circular animado
- `ActivitySparkline` — Mini chart animado

**Librerías:**

- ReactBits: `CountUp`, `AnimatedNumber`
- Custom: SVG gauge animation

#### 4.2 Activity Feed

```
BEFORE: Static list
AFTER:  Real-time animated feed
```

**Componentes nuevos:**

- `ActivityStream` — Feed con nuevas actividades
- `ActivityItem` — Item con icon animado
- `NotificationBadge` — Badge con pulse

---

### Phase 5: Interactions (Week 5-6)

#### 5.1 Voting System

```
BEFORE: Click thumbs up/down
AFTER:  Satisfying animated vote
```

**Componentes nuevos:**

- `VoteButton` — Button con particle burst
- `VoteCounter` — Número con bounce animation
- `ConfettiBurst` — Celebración en vote

#### 5.2 Lists & Collections

```
BEFORE: Static list grid
AFTER:  Drag & drop with animations
```

**Componentes nuevos:**

- `SortableGrid` — Grid con reorder
- `CollectionCard` — Card con preview stack
- `AddButton` — Button con morph animation

---

## 📊 Implementation Timeline

| Fase                      | Duración    | Componentes                    | Prioridad |
| ------------------------- | ----------- | ------------------------------ | --------- |
| **Phase 1: Foundation**   | 1-2 semanas | Layout, Background, Navigation | 🔴 Alta   |
| **Phase 2: Cards**        | 1-2 semanas | Hero Card, Grid Cards          | 🔴 Alta   |
| **Phase 3: Detail Page**  | 1-2 semanas | Backdrop Hero, Episode List    | 🟡 Media  |
| **Phase 4: Dashboard**    | 1 semana    | Stats, Activity Feed           | 🟡 Media  |
| **Phase 5: Interactions** | 1 semana    | Voting, Lists                  | 🟢 Baja   |

**Total estimado:** 5-8 semanas (dependiendo de profundidad)

---

## 🏗️ Technical Implementation

### New Dependencies

```bash
# Animation libraries
pnpm add gsap @gsap/react lenis

# UI components (copy-paste, no install)
# ReactBits, Aceternity, Magic UI → manual copy

# Optional enhancements
pnpm add @use-gesture/react  # Better gesture handling
pnpm add react-intersection-observer  # Scroll triggers
```

### File Structure

```
components/
├── ui/                    # Base Shadcn (keep)
├── cinematic/             # NEW: Cinematic components
│   ├── hero/
│   │   ├── backdrop-hero.tsx
│   │   ├── featured-series.tsx
│   │   └── spotlight-card.tsx
│   ├── cards/
│   │   ├── series-card-3d.tsx
│   │   ├── card-glare.tsx
│   │   └── progress-ring.tsx
│   ├── navigation/
│   │   ├── floating-nav.tsx
│   │   └── sidebar-drawer.tsx
│   ├── backgrounds/
│   │   ├── ambient-bg.tsx
│   │   ├── aurora.tsx
│   │   └── grid-pattern.tsx
│   └── interactions/
│       ├── vote-button.tsx
│       ├── confetti-burst.tsx
│       └── morph-button.tsx
├── animations/            # NEW: Animation utilities
│   ├── page-transition.tsx
│   ├── stagger-list.tsx
│   └── scroll-reveal.tsx
└── effects/               # NEW: Visual effects
    ├── shimmer.tsx
    ├── glow.tsx
    └── blur-overlay.tsx
```

---

## 🎬 Visual Examples (What We're Aiming For)

### Netflix-style Hero

- Full-bleed backdrop con Ken Burns
- Gradient overlay con info
- Botones con shine effect

### Apple TV Card Hover

- 3D tilt con parallax layers
- Soft glow en edges
- Info que emerge del bottom

### Spotify Now Playing

- Progress ring animado
- Pulsing elements
- Smooth transitions

### Linear Issue Cards

- Clean pero con depth
- Hover states premium
- Micro-interactions

---

## 🚀 Quick Wins (Do First)

1. **Smooth Scroll** — Instalar Lenis (10 min)
2. **Page Transitions** — Wrapper con Framer Motion (30 min)
3. **Card 3D Tilt** — Copiar de Aceternity (1 hr)
4. **Ambient Background** — Gradient animado CSS (30 min)
5. **Shimmer Loading** — Skeleton mejorado (30 min)

---

## 📝 Notes

- **Mantener colores actuales** — Solo cambiar forma/animación
- **Mobile-first** — Animaciones deben funcionar en móvil
- **Performance** — Usar `will-change` y `transform` solo
- **Accessibility** — `prefers-reduced-motion` support
- **Progressive enhancement** — App funciona sin animaciones

---

## ✅ Next Steps

1. **Aprobar propuesta** — Confirmar dirección
2. **Setup libraries** — Instalar dependencias
3. **Quick wins sprint** — Implementar los 5 quick wins
4. **Phase 1 start** — Comenzar con Foundation

---

_Propuesta creada: 2026-02-27_
_Proyecto: YaLaVi #3_
_Author: ClawBob 🦀_
