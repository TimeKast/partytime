# TimeKast Agents Directory

> 🚀 **31 Specialist AI Agents** for comprehensive project development

## Quick Reference

### Core Coordination

- **orchestrator** - Multi-agent coordination (14KB, 417 lines)
- **project-planner** - 4-phase BMAD workflow (14KB, 407 lines)
- **tech-lead** - Technical decisions and architecture

### Frontend & Design

- **frontend-specialist** - Senior Frontend Architect (26KB, 594 lines)
  - Deep Design Thinking, Purple Ban, Maestro Auditor
- **design-system-lead** - Design systems and tokens
- **pwa-engineer** - Progressive Web Apps

### Backend & Data

- **backend-specialist** - APIs, server logic (9KB)
- **database-architect** - Schema, queries (**Drizzle standard**)
- **data-modeler-drizzle** - Drizzle ORM specialist

### Architecture

- **project-architect** - System architecture
- **solution-architect-functional** - Business requirements
- **solution-architect-technical** - Technical specifications
- **fullstack-engineer** - End-to-end implementation

### Quality & Security

- **qa-automation-engineer** - E2E testing, Playwright
- **test-engineer** - Unit testing, TDD
- **security-auditor** - OWASP, vulnerabilities
- **penetration-tester** - Offensive security
- **auditor** - General audit protocols

### DevOps & Performance

- **devops-engineer** - CI/CD, Docker, deployment
- **performance-optimizer** - Web Vitals, profiling

### Specialized

- **debugger** - Systematic debugging (4-phase)
- **explorer-agent** - Codebase discovery
- **code-archaeologist** - Legacy code, refactoring
- **mobile-developer** - React Native, Flutter (13KB)
- **game-developer** - Unity, Godot, multiplayer
- **seo-specialist** - SEO, E-E-A-T, metadata

### Product & Documentation

- **product-owner** - Strategy, backlog, MVP
- **product-manager** - Requirements, user stories
- **product-strategist** - Product vision
- **delivery-manager** - Project delivery
- **documentation-writer** - Docs, README
- **technical-writer** - Technical documentation

## TimeKast Standards

> 🔴 **Stack:** Next.js 15 + TypeScript + Drizzle ORM + Neon PostgreSQL

All agents follow:

- `AI_Stack_Standards_NextJS_TS_Drizzle.md` workflow
- Drizzle for database operations (not Prisma)
- Server Actions for mutations
- Zod for validation

## Agent Selection Matrix

| Task            | Primary Agent            | Secondary            |
| --------------- | ------------------------ | -------------------- |
| **Web UI**      | `frontend-specialist`    | `design-system-lead` |
| **API/Backend** | `backend-specialist`     | `database-architect` |
| **Mobile**      | `mobile-developer`       | -                    |
| **Database**    | `data-modeler-drizzle`   | `database-architect` |
| **Testing**     | `qa-automation-engineer` | `test-engineer`      |
| **Security**    | `security-auditor`       | `penetration-tester` |
| **Planning**    | `project-planner`        | `orchestrator`       |
| **Debug**       | `debugger`               | `explorer-agent`     |
