---
description: Comandos de desarrollo y auditoría seguros para auto-run (turbo mode)
---

# Dev Commands - Safe Auto-Run

Este workflow define los comandos de desarrollo, build, y auditoría que son seguros para ejecutarse automáticamente.

// turbo-all

---

## NPM Scripts Seguros

### Build y Verificación

```bash
npm run build
npm run build 2>&1
npm run build 2>&1 | Select-Object -First 80
npm run build 2>&1 | Select-Object -First 100
npm run build 2>&1 | Select-Object -First 120
npm run typecheck
npm run typecheck 2>&1 | Select-Object -First 30
npm run lint
npm run lint 2>&1 | Select-Object -First 50
npm run format
npm run format 2>&1 | Select-Object -First 30
npm run test
npm run dev
npm run dev 2>&1 | Select-Object -First 30
```

### Dependencias (consulta)

```bash
npm list
npm outdated
npm audit
```

---

## Git Combos (Safe Auto-Run)

Comandos git de staging y commit que son seguros para auto-run:

> ⚠️ **IMPORTANTE**: NUNCA uses `&&` para encadenar comandos. Usa `;` solo para git add + commit como se muestra abajo, o ejecuta cada comando **por separado**.

```bash
git add -A
git add .
git add -A; git commit -m "mensaje"
git add .; git commit -m "mensaje"
git push
git status
git log -n 5
git diff --stat
```

> 📝 **Nota**: Los combos con `;` (git add + commit) son la **única excepción** permitida porque son operaciones atómicas relacionadas. Para `gh` (GitHub CLI), **siempre** ejecuta comandos por separado.

## NPX Seguros

### TypeScript

```bash
npx tsc --noEmit
npx tsc --noEmit 2>&1 | Select-Object -First 50
npx tsc --version
```

### ESLint

```bash
npx eslint .
npx eslint --fix .
```

### Prettier

```bash
npx prettier --check .
npx prettier --write .
```

### Drizzle (solo consulta)

```bash
npx drizzle-kit check
npx drizzle-kit introspect
```

---

## Comandos de Lectura Seguros

### Sistema de archivos

```bash
cat <file>
type <file>
Get-Content <file>
ls
dir
tree
```

### PowerShell específicos

```bash
Get-ChildItem
Get-Process
Get-Location
```

---

## Comandos que Requieren Confirmación

Los siguientes comandos **NO** deben ser auto-run:

- `npm install` (modifica node_modules)
- `npm uninstall` (elimina dependencias)
- `npm update` (actualiza dependencias)
- `npx drizzle-kit push` (modifica BD)
- `npx drizzle-kit migrate` (modifica BD)
- `rm`, `Remove-Item`, `del` (elimina archivos)
- Cualquier comando con `--force` o `-f` flag

---

## Notas para el Agente

1. **npm run build**: Seguro porque solo genera archivos en `.next/`
2. **npm run lint/typecheck**: Solo analizan, no modifican
3. **npm run format**: Modifica archivos pero son cambios cosméticos seguros
4. **npx tsc --noEmit**: Solo verifica tipos, no genera archivos

---

_Workflow creado: 19 de enero de 2026_
