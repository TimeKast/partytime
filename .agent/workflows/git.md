---
description: Comandos Git seguros para auto-run (turbo mode)
---

# Git Commands - Safe Auto-Run

Este workflow define los comandos Git que son seguros para ejecutarse automáticamente sin confirmación del usuario.

// turbo-all

---

## Comandos Seguros (SafeToAutoRun = true)

Los siguientes comandos son **seguros** para auto-run porque no tienen efectos destructivos:

### Estado y Consulta

```bash
git status
git log -n 10
git diff
git branch
git remote -v
git show
```

### Staging

```bash
git add -A
git add .
git add <file>
```

### Commit (con mensaje inline)

```bash
git commit -m "<mensaje>"
git commit -m "<mensaje>" --no-verify
```

### Push (a branch actual)

```bash
git push
git push origin <branch>
```

### Pull

```bash
git pull
git pull origin main
git fetch
git fetch --all
```

---

## Comandos que Requieren Confirmación

Los siguientes comandos **NO** deben ser auto-run:

- `git reset --hard` (pérdida de datos)
- `git push --force` (reescribe historial)
- `git clean -fd` (elimina archivos)
- `git checkout -- .` (descarta cambios)
- `git rebase` (reescribe historial)
- `git merge` (puede generar conflictos)
- `git stash drop` (pérdida de datos)
- `git branch -D` (elimina branches)

---

## Notas para el Agente

1. **git commit -m "..."**: El flag `-m` hace que sea no-interactivo, por lo tanto seguro para auto-run
2. **git push**: Solo es seguro si no hay conflictos pendientes
3. **git add -A**: Siempre seguro, solo marca archivos para staging

---

_Workflow actualizado: 19 de enero de 2026_
