---
name: "🐛 Reporte de bug"
about: "Reportar un error o comportamiento inesperado en WinsiBot"
title: "[BUG] "
labels: ["bug", "needs-triage"]
assignees: Brashkie
---

<!-- ¡Gracias por reportar! Completa cada sección con la mayor precisión posible. Las issues incompletas pueden cerrarse sin resolución. -->

## 🐛 Descripción del problema

> Una descripción clara y concisa de lo que está fallando.

<!-- Escribe aquí -->

---

## 🔬 Pasos para reproducir

> Pasos mínimos y exactos para que el bug ocurra consistentemente.

1. Iniciar el bot con `npm run start`
2. En el grupo/privado: enviar el comando `!...`
3. Observar que ...

---

## ✅ Comportamiento esperado

> ¿Qué debería pasar?

<!-- Escribe aquí -->

## ❌ Comportamiento actual

> ¿Qué pasa en realidad?

<!-- Escribe aquí -->

---

## 📋 Logs / Output del terminal

> Pega el output de `npm run monitor` o `npm run dev` donde se ve el error.
> **Elimina cualquier creds.json, token o número de teléfono antes de pegar.**

```
Pega aquí
```

<details>
<summary>Stack trace completo (si hay)</summary>

```
Pega aquí
```

</details>

---

## 🖥️ Entorno

| Campo | Valor |
|-------|-------|
| OS | Windows 11 / Ubuntu 22.04 / Debian 12 |
| Node.js | `node --version` → |
| npm | `npm --version` → |
| Python | `python --version` → |
| Rust | `rustc --version` → |
| WinsiBot | v8.1.0 |
| Baileys | `npm list @whiskeysockets/baileys` → |
| Redis activo | Sí / No |

---

## 📦 Categoría del bug

> Marca con `x` donde aplica.

- [ ] 🟦 TypeScript / Core (handler, comandos, eventos)
- [ ] 🐍 Python (monitor, FastAPI, Celery, watchdog)
- [ ] ⚙️ Rust (Session API, snapshots, atomic write)
- [ ] 🔐 Sesión / QR / Reconexión
- [ ] 🤖 IA (GPT, Claude, Gemini)
- [ ] 🎮 RPG / Economía / Gacha
- [ ] 🛡️ Moderación (antilink, antispam, warn)
- [ ] 🔧 Infraestructura (Docker, PM2, variables de entorno)
- [ ] 📚 Documentación
- [ ] ❓ Otro

---

## 🧩 Información adicional

> Capturas de pantalla, contexto extra, comportamiento intermitente, etc.

<!-- Escribe aquí -->

---

> **Antes de enviar:**
> - [ ] Busqué en las [issues existentes](../../issues) y no encontré duplicado
> - [ ] Probé con `npm run manage:diagnose` y el problema persiste
> - [ ] No incluí sesión, creds ni datos sensibles en los logs
