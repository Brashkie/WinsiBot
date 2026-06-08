---
name: "✨ Solicitud de feature"
about: "Proponer una nueva funcionalidad o mejora para WinsiBot"
title: "[FEATURE] "
labels: ["enhancement", "needs-triage"]
assignees: Brashkie
---

<!-- ¡Gracias por la propuesta! Cuanto más detallada, mayor probabilidad de que sea implementada. -->

## 🎯 ¿Qué problema resuelve este feature?

> Una descripción clara del problema o limitación que motiva esta solicitud.
> Ejemplo: *"Como moderador, no puedo ver quién envió un mensaje eliminado porque antidelete no captura stickers."*

<!-- Escribe aquí -->

---

## 💡 Solución propuesta

> Describe cómo debería funcionar el feature. Incluye:
> - Nombre del comando (si aplica): `!comando`
> - Aliases sugeridos
> - Comportamiento esperado paso a paso
> - Permisos requeridos (usuario / premium / helper / mod / owner)

<!-- Escribe aquí -->

---

## 📸 Mockup / Ejemplo de output

> Si aplica, muestra cómo se vería el mensaje de respuesta del bot.

```
!nuevocomando @usuario

╭──────────────────────────╮
│  ✨ Título del resultado  │
├──────────────────────────┤
│  Detalle 1: valor        │
│  Detalle 2: valor        │
╰──────────────────────────╯
```

---

## 🏗️ Capa de implementación sugerida

> Marca con `x` donde crees que encaja mejor.

- [ ] 🟦 TypeScript — nuevo comando en `src/plugins/commands/`
- [ ] 🐍 Python — nuevo endpoint en FastAPI / tarea Celery
- [ ] ⚙️ Rust — mejora en Session API
- [ ] 📦 Nueva dependencia npm / pip / crate
- [ ] 🗄️ Base de datos — nueva tabla o campo en SQLite
- [ ] ⚙️ Configuración — nuevo campo en `.env`
- [ ] ❓ No lo sé

---

## 🔄 Alternativas consideradas

> ¿Hay otras formas de resolver el problema? ¿Por qué esta solución es mejor?

<!-- Escribe aquí -->

---

## ⚠️ Impacto / Consideraciones

> ¿Podría afectar comandos existentes? ¿Requiere migración de datos? ¿Implica costos de API?

<!-- Escribe aquí -->

---

## 🔗 Contexto adicional

> Referencias, capturas de pantalla, bots similares con este feature, issues relacionadas, etc.

<!-- Escribe aquí -->

---

> **Antes de enviar:**
> - [ ] Busqué en las [issues existentes](../../issues) y no encontré propuesta duplicada
> - [ ] El feature encaja con la naturaleza de un bot de WhatsApp
> - [ ] Consideré el impacto en el rendimiento (443+ grupos simultáneos)
