# Reglas del Agente

## Workflow Obligatorio `/start`

Cuando el usuario mencione `@/start` o `/start`, **SIEMPRE** debes:

1. **Ejecutar CADA paso** del workflow `.agent/workflows/start.md` de forma explícita
2. **Leer los agentes indicados COMPLETOS** según la clasificación del request
3. **Leer los docs indicados COMPLETOS** explorando `/docs/` y seleccionando los relevantes
4. **NO tomar shortcuts** aunque tengas contexto previo de la conversación o de sesiones anteriores
5. **Confirmar contexto cargado** ANTES de proceder a implementar

### Formato de Confirmación Requerido

Antes de implementar, debes mostrar:

```
✅ Contexto Cargado
- Clasificación: [tipo(s)]
- Agentes leídos: [lista de archivos]
- Docs leídos: [lista de archivos]
- Reglas globales: Confirmado

¿Procedo con [breve descripción del request]?
```

### Prioridad

Esta regla tiene **prioridad sobre cualquier optimización de eficiencia**. El workflow completo es obligatorio para garantizar calidad y consistencia.

---

## Reglas de Ejecución

### Git en PowerShell

- NO usar `&&` para encadenar comandos
- Ejecutar `git add` y `git commit` como comandos separados

### Calidad de Código

- Siempre ejecutar `npm run format` después de hacer cambios
- Siempre ejecutar `npm run build` antes de hacer commit
- Siempre ejecutar `npm run typecheck` para validar TypeScript

---

## Documentación

Después de implementar features que afecten comportamiento de la app:

- Evaluar impacto en `/docs/`
- Actualizar documentación si es necesario
- Seguir el protocolo de `/plan/7.1_Mantenimiento_Docs.md`
