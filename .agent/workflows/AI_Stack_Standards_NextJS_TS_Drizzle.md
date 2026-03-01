# 🛠️ AI Stack Standards: Next.js + TypeScript + Drizzle

> **Documento específico del stack técnico.**
> Solo aplica cuando el proyecto usa: Next.js App Router + TypeScript + Drizzle ORM.
> Complementa `AI_Development_Rules_And_Best_Practices.md` (que siempre aplica).

---

## 📚 Stack Técnico

| Capa          | Tecnología               | Notas                              |
| ------------- | ------------------------ | ---------------------------------- |
| Framework     | Next.js 15+ (App Router) | Solo App Router, NO Pages Router   |
| Lenguaje      | TypeScript (strict mode) | No `any`, no `// @ts-ignore`       |
| Database      | PostgreSQL + Drizzle ORM | Migraciones explícitas             |
| Auth          | NextAuth.js v5 (Auth.js) | Credentials + OAuth según proyecto |
| Styling       | Tailwind CSS             | Mobile-first, dark mode ready      |
| Validación    | Zod                      | Para forms y Server Actions        |
| UI Components | shadcn/ui (opcional)     | Si el proyecto lo requiere         |

---

## 📁 Estructura de Proyecto

```
/app
  /(auth)           # Páginas públicas (login, register)
  /(dashboard)      # Páginas protegidas
    /[entity]       # CRUD por entidad
  /api              # Solo si necesitas REST (preferir Server Actions)
  layout.tsx
  page.tsx

/components
  /ui               # Componentes reutilizables genéricos
  /[feature]        # Componentes específicos por feature

/lib
  /actions          # Server Actions
  /db               # Drizzle schema + queries
  /utils            # Helpers puros

/types              # TypeScript types/interfaces globales
```

---

## 🔒 Seguridad

### Autenticación

- Toda ruta en `/(dashboard)` debe verificar sesión
- Usar `auth()` de NextAuth en Server Components
- Nunca exponer datos de sesión sensibles al cliente

### Autorización (RBAC)

- Definir roles en `/docs/05_permissions_rbac.md`
- Verificar permisos en CADA Server Action
- Principio de menor privilegio siempre

### Datos

- Validar TODOS los inputs con Zod antes de usar
- Sanitizar datos antes de insertar en DB
- No loguear datos sensibles (passwords, tokens)

### Secrets

- Todos los secrets en `.env` (nunca hardcoded)
- `.env` en `.gitignore`

---

## 📝 Patrones de Código

### TypeScript

```typescript
// ✅ Correcto
type User = {
  id: string;
  email: string;
  role: 'admin' | 'user';
};

// ❌ Incorrecto
const user: any = await getUser();
```

### Server Actions (Patrón Estándar)

```typescript
'use server';

import { z } from 'zod';
import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const schema = z.object({
  name: z.string().min(1).max(100),
});

export async function createEntity(formData: FormData) {
  // 1. Auth check
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  // 2. Parse & validate
  const parsed = schema.safeParse({
    name: formData.get('name'),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten() };
  }

  // 3. Authorization check
  if (session.user.role !== 'admin') {
    return { error: 'Forbidden' };
  }

  // 4. Business logic
  try {
    await db.insert(entities).values(parsed.data);
    revalidatePath('/entities');
    return { success: true };
  } catch (e) {
    return { error: 'Failed to create entity' };
  }
}
```

### Manejo de Errores

```typescript
// ✅ Retornar objetos, no throw en actions públicas
return { error: 'mensaje user-friendly' };
return { success: true, data: result };
```

---

## 📐 Naming Conventions

| Tipo               | Convención      | Ejemplo           |
| ------------------ | --------------- | ----------------- |
| Files (components) | kebab-case      | `user-card.tsx`   |
| Files (actions)    | kebab-case      | `user-actions.ts` |
| Components         | PascalCase      | `UserCard`        |
| Functions          | camelCase       | `getUserById`     |
| Constants          | SCREAMING_SNAKE | `MAX_FILE_SIZE`   |
| DB tables          | snake_case      | `user_sessions`   |
| Types/Interfaces   | PascalCase      | `UserSession`     |

---

## 📱 Responsive & UX

- Mobile-first: diseñar para 375px primero
- Breakpoints: `sm:640` `md:768` `lg:1024` `xl:1280`
- **NO scroll horizontal** en ningún viewport
- Touch targets mínimo 44x44px
- `font-size: 16px` en inputs móviles (evita zoom iOS)

### Estados de UI obligatorios

- **Loading**: skeleton o spinner
- **Empty**: mensaje + CTA si aplica
- **Error**: mensaje claro + acción de retry
- **Success**: feedback visual

---

## 🔄 Git Conventions

### Commits

```
<type>(<scope>): <description>

feat(users): add email verification flow
fix(auth): handle expired session correctly
```

Tipos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

### Branches

```
app-xxx/<slug>        # Para issues del backlog
fix/<descripcion>     # Para hotfixes
```

---

## ✅ Pre-Commit Checklist

```bash
npm run typecheck    # Sin errores
npm run lint         # Sin errores críticos
npm run build        # Compila correctamente
npm run test         # Tests pasando (si existen)
```

---

## 🚫 Anti-Patrones

| ❌ No hacer                | ✅ Hacer en su lugar          |
| -------------------------- | ----------------------------- |
| `any` type                 | Tipos explícitos              |
| `// @ts-ignore`            | Arreglar el tipo              |
| `console.log` en prod      | Logger o eliminar             |
| Fetch en Client Components | Server Components + Actions   |
| CSS inline extenso         | Tailwind classes              |
| Secrets hardcodeados       | Variables de entorno          |
| Catch vacío `catch {}`     | Manejar o re-throw            |
| Lógica en `page.tsx`       | Extraer a componentes/actions |

---

## 📊 Métricas de Calidad

| Métrica               | Umbral             |
| --------------------- | ------------------ |
| TypeScript errors     | 0                  |
| ESLint errors         | 0                  |
| Build warnings        | < 5                |
| Bundle size increase  | < 50KB por feature |
| Core Web Vitals (LCP) | < 2.5s             |
