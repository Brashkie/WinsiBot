<!-- Gracias por contribuir a WinsiBot. Completa esta plantilla antes de solicitar review. -->

## 📝 Descripción

> ¿Qué introduce este PR y por qué es necesario?
> Incluye el contexto que no es obvio leyendo el diff (decisiones de diseño, limitaciones encontradas, etc.)

<!-- Escribe aquí -->

Closes #<!-- número de issue, si aplica -->

---

## 🏷️ Tipo de cambio

- [ ] 🐛 **Bug fix** — corrección no rupturista
- [ ] ✨ **Nueva funcionalidad** — cambio no rupturista que añade features
- [ ] 💥 **Breaking change** — fix o feature que rompe compatibilidad existente
- [ ] ♻️ **Refactor** — ni bug fix ni nueva funcionalidad
- [ ] ⚡ **Performance** — mejora de rendimiento
- [ ] 🔒 **Seguridad** — corrección de vulnerabilidad
- [ ] 📝 **Documentación** — solo cambios en docs
- [ ] 🔧 **Build / CI** — cambios en build system o pipelines

---

## 📋 Cambios realizados

> Lista los cambios principales. Una línea por cambio, empezando con el archivo o módulo afectado.

- `src/plugins/commands/…` — 
- `src/lib/…` — 
- `python/…` — 
- `rust/…` — 
- `docs/…` — 

---

## 🧪 Cómo probar

> Pasos exactos para verificar que los cambios funcionan correctamente.

1. `npm run start:all`
2. En WhatsApp: enviar `!...`
3. Verificar que ...

**Casos borde probados:**
- [ ] Funciona en grupo
- [ ] Funciona en privado
- [ ] Funciona sin argumentos (manejo de error)
- [ ] Funciona con `@mención` / citando mensaje
- [ ] Cooldown respetado

---

## ✅ Checklist pre-merge

**Código:**
- [ ] `npm run build` pasa sin errores
- [ ] `npx tsc --noEmit --skipLibCheck` sin errores de tipo
- [ ] `npm run rust:build` pasa (si modifiqué Rust)
- [ ] No hay `console.log` de debug sueltos
- [ ] Variables de entorno nuevas documentadas en `.env.example`

**Seguridad:**
- [ ] No incluyo archivos `auth/`, `.env`, `creds.json`, `session-*.json`
- [ ] No expongo claves de API ni tokens en el código
- [ ] No hay vulnerabilidades de command injection (si usé `exec` / `terminal`)

**Documentación:**
- [ ] `docs/commands.md` actualizado (si añadí/modifiqué comandos)
- [ ] `docs/commands.en.md` actualizado (si aplica)
- [ ] `README.md` actualizado (si cambié arquitectura, deps, o env vars)
- [ ] Comentarios en código solo donde el WHY no es obvio

**Base de datos (si aplica):**
- [ ] Migración de esquema no rompe datos existentes
- [ ] `db.loadAll()` / `db.saveAll()` siguen funcionando

---

## 📸 Capturas / Output

> Si el PR cambia el output visible del bot, muestra antes/después.

<details>
<summary>Antes</summary>

```
output anterior
```

</details>

<details>
<summary>Después</summary>

```
output nuevo
```

</details>

---

## 🔗 Issues relacionadas

<!-- Closes #123, Fixes #456, Related to #789 -->
