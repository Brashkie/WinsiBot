"""
WinsiBot — Catálogo de comandos para Hepein.
Permite que la IA responda preguntas sobre cómo usar el bot.
"""

from __future__ import annotations
import re
from typing import Optional

# ─── Catálogo ─────────────────────────────────────────────────────────────────

COMMANDS: list[dict] = [
    # ── RPG ──────────────────────────────────────────────────────────────────
    {
        'name': 'rw', 'aliases': ['roll', 'gacha', 'rollimage', 'rollwaifu'],
        'category': 'rpg',
        'usage': '!rw [fuente]',
        'desc': 'Obtiene un personaje aleatorio. Fuentes disponibles: marvel, pokedex. '
                'Ejemplo: !rw marvel · !rw pokedex. '
                'Cooldown: 29 minutos por usuario.',
    },
    {
        'name': 'c', 'aliases': ['claim'],
        'category': 'rpg',
        'usage': '!c  (respondiendo al mensaje del personaje)',
        'desc': 'Reclama el personaje activo en el grupo. '
                'Debes responder directamente al mensaje del personaje y escribir !c. '
                'El personaje expira en 10 minutos si nadie lo reclama.',
    },
    {
        'name': 'steal',
        'category': 'rpg',
        'usage': '!steal @usuario NombrePersonaje',
        'desc': 'Roba un personaje del inventario de otro usuario. '
                'El otro jugador tiene un tiempo para defenderse.',
    },
    {
        'name': 'inv', 'aliases': ['inventory', 'inventario'],
        'category': 'rpg',
        'usage': '!inv [@usuario]',
        'desc': 'Muestra tu inventario de personajes reclamados. '
                'Si mencionas a alguien, muestra el inventario de esa persona.',
    },
    {
        'name': 'wimage', 'aliases': ['wi', 'waifuimage'],
        'category': 'rpg',
        'usage': '!wimage NombrePersonaje',
        'desc': 'Muestra una imagen aleatoria de un personaje. '
                'Busca en todas las fuentes (marvel, pokedex). '
                'También acepta nombres en español (traduce automáticamente). '
                'Ejemplo: !wimage Spider-Man · !wimage hombre araña · !wimage Pikachu',
    },
    {
        'name': 'winfo', 'aliases': ['waifuinfo', 'charinfo'],
        'category': 'rpg',
        'usage': '!winfo NombrePersonaje',
        'desc': 'Muestra información detallada de un personaje: género, valor, quién lo tiene, '
                'fecha de reclamo, fuente, puesto, último voto, habilidad y debilidad.',
    },
    {
        'name': 'prestige',
        'category': 'rpg',
        'usage': '!prestige',
        'desc': 'Sube de rango (prestige) usando tus personajes acumulados. '
                'Resetea progreso a cambio de un rango permanente más alto.',
    },
    {
        'name': 'mascota',
        'category': 'rpg',
        'usage': '!mascota [acción]',
        'desc': 'Gestiona tu mascota virtual: alimentar, jugar, ver estado, evolucionar.',
    },
    {
        'name': 'regalo',
        'category': 'rpg',
        'usage': '!regalo @usuario NombrePersonaje',
        'desc': 'Regala uno de tus personajes a otro usuario del grupo.',
    },

    # ── Juegos ───────────────────────────────────────────────────────────────
    {
        'name': 'arena',
        'category': 'games',
        'usage': '!arena @usuario',
        'desc': 'Inicia un combate PvP contra otro jugador. '
                'Los personajes del inventario de cada uno pelean entre sí.',
    },
    {
        'name': 'quiz',
        'category': 'games',
        'usage': '!quiz',
        'desc': 'Pregunta de trivia aleatoria. '
                'El primero en responder correctamente gana puntos.',
    },
    {
        'name': 'adivinar',
        'category': 'games',
        'usage': '!adivinar',
        'desc': 'Minijuego Draw & Guess: adivina el personaje a partir de pistas visuales.',
    },

    # ── General ───────────────────────────────────────────────────────────────
    {
        'name': 'menu', 'aliases': ['help', 'ayuda', 'start'],
        'category': 'general',
        'usage': '!menu',
        'desc': 'Muestra el menú principal del bot con todas las categorías disponibles.',
    },
    {
        'name': 'categoria', 'aliases': ['cat', 'cats', 'categorias'],
        'category': 'general',
        'usage': '!categoria [nombre]',
        'desc': 'Lista los comandos de una categoría. '
                'Sin argumento: muestra todas las categorías. '
                'Ejemplo: !categoria rpg · !categoria juegos',
    },
    {
        'name': 'ping',
        'category': 'general',
        'usage': '!ping',
        'desc': 'Muestra la latencia del bot y confirma que está activo.',
    },
    {
        'name': 'info',
        'category': 'general',
        'usage': '!info',
        'desc': 'Información del bot: versión, comandos totales, uptime.',
    },
    {
        'name': 'sticker', 'aliases': ['s', 'stiker'],
        'category': 'sticker',
        'usage': '!sticker  (enviando o respondiendo una imagen/video)',
        'desc': 'Convierte una imagen o video corto en sticker de WhatsApp.',
    },
    {
        'name': 'stickerpack',
        'category': 'sticker',
        'usage': '!stickerpack NombrePack',
        'desc': 'Busca y muestra un pack de stickers por nombre.',
    },

    # ── Descargas ─────────────────────────────────────────────────────────────
    {
        'name': 'yt', 'aliases': ['youtube'],
        'category': 'downloader',
        'usage': '!yt URL',
        'desc': 'Descarga un video de YouTube. Envía el enlace y el bot manda el video.',
    },
    {
        'name': 'tt', 'aliases': ['tiktok'],
        'category': 'downloader',
        'usage': '!tt URL',
        'desc': 'Descarga un video de TikTok sin marca de agua.',
    },
    {
        'name': 'ig', 'aliases': ['instagram'],
        'category': 'downloader',
        'usage': '!ig URL',
        'desc': 'Descarga un video o reels de Instagram.',
    },
    {
        'name': 'ttsearch',
        'category': 'downloader',
        'usage': '!ttsearch búsqueda',
        'desc': 'Busca videos en TikTok por palabras clave y devuelve el primero.',
    },
    {
        'name': 'apk', 'aliases': ['downloadapk'],
        'category': 'downloader',
        'usage': '!apk NombreApp',
        'desc': 'Busca y descarga un APK de Android por nombre de aplicación.',
    },

    # ── Admin ─────────────────────────────────────────────────────────────────
    {
        'name': 'hepein',
        'category': 'admin',
        'usage': '!hepein on|off',
        'desc': 'Activa o desactiva la IA Hepein en el grupo. Solo admins. '
                'Cuando está activo, Hepein responde cuando lo mencionan.',
    },
    {
        'name': 'ban',
        'category': 'admin',
        'usage': '!ban @usuario [razón]',
        'desc': 'Banea a un usuario del bot (no del grupo). Solo admins y owner.',
    },
    {
        'name': 'warn',
        'category': 'admin',
        'usage': '!warn @usuario [razón]',
        'desc': 'Da una advertencia a un usuario. Solo admins.',
    },
    {
        'name': 'kick',
        'category': 'admin',
        'usage': '!kick @usuario',
        'desc': 'Expulsa a un usuario del grupo. Solo admins del grupo.',
    },
    {
        'name': 'antilink', 'aliases': ['antilinks'],
        'category': 'admin',
        'usage': '!antilink on|off',
        'desc': 'Activa/desactiva la protección antilinks en el grupo. Solo admins.',
    },
]

# ─── Índices rápidos ──────────────────────────────────────────────────────────

_by_name: dict[str, dict]         = {}
_by_category: dict[str, list[dict]] = {}

for _cmd in COMMANDS:
    _by_name[_cmd['name']] = _cmd
    for _alias in _cmd.get('aliases', []):
        _by_name[_alias] = _cmd
    _by_category.setdefault(_cmd['category'], []).append(_cmd)

CATEGORY_LABELS = {
    'rpg':        '🎴 RPG / Gacha',
    'games':      '🕹️ Juegos',
    'general':    '🔧 General',
    'sticker':    '🖼️ Stickers',
    'downloader': '⬇️ Descargas',
    'admin':      '🛡️ Admin',
}

# ─── Detección ────────────────────────────────────────────────────────────────

_QUERY_RE = re.compile(
    r'\b(cómo|como|qué|que|para|cuál|cual|cuáles|cuales|'
    r'usar|uso|sirve|hace|es|listar|lista|ver|mostrar|'
    r'ayuda|help|comando|comandos|menu|menú|función|funciones|'
    r'disponible|disponibles|tienes|tienen|existe|explicar|explicame|'
    r'dime|dices|saber|quiero|puedo|puedes)\b',
    re.IGNORECASE,
)

def is_command_query(prompt: str) -> bool:
    """¿El usuario está preguntando sobre comandos del bot?"""
    return '!' in prompt or bool(_QUERY_RE.search(prompt))


def find_commands_for_prompt(prompt: str) -> tuple[list[dict], bool]:
    """
    Devuelve (comandos_relevantes, es_lista_completa).
    Si menciona un comando/alias concreto → sólo ese.
    Si menciona una categoría → los de esa categoría.
    Si pide todo el menú / lista general → todos.
    """
    lower = prompt.lower()

    # 1. Comando o alias específico mencionado (ej: "!rw", "wimage", "roll")
    found: list[dict] = []
    seen: set[str] = set()
    for token in re.split(r'[\s!,?¿¡]+', lower):
        token = token.strip()
        if not token:
            continue
        cmd = _by_name.get(token)
        if cmd and cmd['name'] not in seen:
            found.append(cmd)
            seen.add(cmd['name'])

    if found:
        return found, False

    # 2. Categoría mencionada
    cat_map = {
        'rpg': 'rpg', 'gacha': 'rpg', 'waifu': 'rpg', 'personaje': 'rpg', 'personajes': 'rpg',
        'juegos': 'games', 'juego': 'games', 'arena': 'games', 'quiz': 'games',
        'general': 'general', 'basico': 'general', 'básico': 'general',
        'sticker': 'sticker', 'stickers': 'sticker',
        'descargar': 'downloader', 'descarga': 'downloader', 'descargas': 'downloader',
        'admin': 'admin', 'administrador': 'admin', 'moderacion': 'admin',
    }
    for word, cat in cat_map.items():
        if word in lower:
            return _by_category.get(cat, []), False

    # 3. Pide lista completa
    list_words = {'todos', 'todo', 'lista', 'listar', 'menu', 'menú', 'categorias',
                  'categorías', 'disponibles', 'comandos'}
    if list_words & set(lower.split()):
        return COMMANDS, True

    # 4. No se detectó nada específico → devuelve lista completa
    return COMMANDS, True


def build_commands_section(prompt: str) -> str:
    """
    Genera el bloque de texto con información de comandos relevantes
    para inyectar en el system prompt de Hepein.
    """
    commands, is_full = find_commands_for_prompt(prompt)

    if not commands:
        return ''

    lines = ['Información sobre los comandos del bot WinsiBot (prefijo !):']

    if is_full:
        # Resumen por categoría
        for cat, cat_label in CATEGORY_LABELS.items():
            cat_cmds = _by_category.get(cat, [])
            if not cat_cmds:
                continue
            names = ', '.join(f'!{c["name"]}' for c in cat_cmds)
            lines.append(f'  {cat_label}: {names}')
        lines.append('El usuario puede preguntar por cualquiera de estos comandos.')
    else:
        # Detalle de los comandos relevantes
        for cmd in commands:
            aliases_str = ''
            if cmd.get('aliases'):
                aliases_str = f' (alias: {", ".join("!" + a for a in cmd["aliases"])})'
            lines.append(f'  • !{cmd["name"]}{aliases_str} — {cmd["desc"]}')
            lines.append(f'    Uso: {cmd["usage"]}')

    lines.append('Responde explicando cómo usar el comando de forma clara y breve.')
    return '\n'.join(lines)
