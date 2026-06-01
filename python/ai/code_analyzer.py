"""
WinsiBot — Code Analyzer
Detecta código obsoleto, malas prácticas y funciones deprecadas
Corre una vez al arrancar el bot
"""

import re
import json
import hashlib
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, asdict, field
from rich.console import Console
from rich.table import Table

console  = Console()
ROOT_DIR = Path(__file__).parent.parent.parent
DATA_DIR = ROOT_DIR / 'data'
ANALYSIS_LOG = DATA_DIR / 'code_analysis.json'

# ─── Tipos ────────────────────────────────────────────────────────────────────
@dataclass
class CodeIssue:
    id:          str
    severity:    str        # critical | high | medium | low
    category:    str        # deprecated | bad_practice | security | performance | outdated
    file:        str
    line:        int
    code:        str        # línea afectada
    message:     str
    suggestion:  str
    language:    str        # ts | python

@dataclass
class AnalysisReport:
    timestamp:   str
    total:       int
    critical:    int
    by_file:     dict = field(default_factory=dict)
    by_category: dict = field(default_factory=dict)
    issues:      list = field(default_factory=list)

# ─── Reglas TypeScript ────────────────────────────────────────────────────────
TS_RULES = [
    # ── deprecated Baileys ────────────────────────────────────────────────────
    {
        'pattern':   r'generateWAMessageFromContent',
        'severity':  'high',
        'category':  'deprecated',
        'message':   'generateWAMessageFromContent deprecado en Baileys reciente',
        'suggestion':'Usar generateWAMessage o sock.sendMessage directamente',
    },
    {
        'pattern':   r'prepareMessageMediaContent',
        'severity':  'high',
        'category':  'deprecated',
        'message':   'prepareMessageMediaContent removido en Baileys v6+',
        'suggestion':'Usar sock.sendMessage con buffer directo',
    },
    {
        'pattern':   r'\.updateBlockStatus\(',
        'severity':  'medium',
        'category':  'deprecated',
        'message':   'updateBlockStatus cambió de firma en Baileys reciente',
        'suggestion':'Verificar firma actual en types/Socket.d.ts',
    },
    {
        'pattern':   r'getContentType\(',
        'severity':  'medium',
        'category':  'deprecated',
        'message':   'getContentType movido — importar desde baileys/lib/Utils',
        'suggestion':'import { getContentType } from "@whiskeysockets/baileys"',
    },
    {
        'pattern':   r'WAProto\.',
        'severity':  'medium',
        'category':  'deprecated',
        'message':   'WAProto importado directamente — frágil ante updates de proto',
        'suggestion':'Usar tipos de alto nivel de Baileys en lugar de proto crudo',
    },
    {
        'pattern':   r'sock\.user\.id(?!\?)',
        'severity':  'low',
        'category':  'bad_practice',
        'message':   'sock.user.id sin optional chaining — puede ser undefined',
        'suggestion':'Usar sock.user?.id ?? ""',
    },
    # ── malas prácticas TS ────────────────────────────────────────────────────
    {
        'pattern':   r'await sock\.sendMessage(?!.*safeSend)',
        'severity':  'medium',
        'category':  'bad_practice',
        'message':   'sock.sendMessage sin safeSend — no reintenta si Connection Closed',
        'suggestion':'Envolver con safeSend(() => sock.sendMessage(...))',
    },
    {
        'pattern':   r'catch\s*\(\s*\)\s*\{\s*\}',
        'severity':  'high',
        'category':  'bad_practice',
        'message':   'catch vacío — errores silenciados sin log',
        'suggestion':'Agregar al menos console.warn o logger.warn en el catch',
    },
    {
        'pattern':   r'catch\s*\(.*\)\s*\{\s*\}',
        'severity':  'high',
        'category':  'bad_practice',
        'message':   'catch vacío — errores silenciados sin log',
        'suggestion':'Agregar al menos console.warn o logger.warn en el catch',
    },
    {
        'pattern':   r'console\.log\(',
        'severity':  'low',
        'category':  'bad_practice',
        'message':   'console.log directo — usar logger de pino',
        'suggestion':'import { logger } from "@core/logger" · logger.info/debug/warn',
    },
    {
        'pattern':   r'any(?:\s*[,;:\)]|\s*=)',
        'severity':  'low',
        'category':  'bad_practice',
        'message':   'Tipo "any" explícito — pierde type safety',
        'suggestion':'Definir tipo específico o usar unknown con type guard',
    },
    {
        'pattern':   r'setTimeout\(.*,\s*0\)',
        'severity':  'low',
        'category':  'performance',
        'message':   'setTimeout 0ms — usar setImmediate o queueMicrotask',
        'suggestion':'setImmediate(() => ...) es más eficiente para defer',
    },
    {
        'pattern':   r'JSON\.parse\([^)]+\)(?!\s*catch)(?!.*try)',
        'severity':  'medium',
        'category':  'bad_practice',
        'message':   'JSON.parse sin try/catch — puede crashear con JSON inválido',
        'suggestion':'Envolver en try/catch o usar una función parseJSON segura',
    },
    # ── seguridad ─────────────────────────────────────────────────────────────
    {
        'pattern':   r'eval\(',
        'severity':  'critical',
        'category':  'security',
        'message':   'eval() — ejecución de código arbitrario, peligroso',
        'suggestion':'Eliminar eval — reemplazar con lógica explícita',
    },
    {
        'pattern':   r'process\.env\.[A-Z_]+(?!\s*\?\?)',
        'severity':  'low',
        'category':  'bad_practice',
        'message':   'process.env sin fallback — undefined si variable no existe',
        'suggestion':'process.env.VAR ?? "default"',
    },
    # ── outdated patterns ─────────────────────────────────────────────────────
    {
        'pattern':   r'require\(',
        'severity':  'medium',
        'category':  'outdated',
        'message':   'require() en proyecto ESM/TypeScript',
        'suggestion':'Usar import ... from "..." consistente con el resto del proyecto',
    },
    {
        'pattern':   r'var\s+\w+',
        'severity':  'low',
        'category':  'outdated',
        'message':   'var declaración — obsoleto en TypeScript moderno',
        'suggestion':'Usar const o let',
    },
]

# ─── Reglas Python ────────────────────────────────────────────────────────────
PY_RULES = [
    # ── deprecated Python ─────────────────────────────────────────────────────
    {
        'pattern':   r'from\s+cgi\s+import|import\s+cgi\b',
        'severity':  'high',
        'category':  'deprecated',
        'message':   'módulo cgi deprecado desde Python 3.11, removido en 3.13',
        'suggestion':'Usar flask/fastapi para manejo de formularios HTTP',
    },
    {
        'pattern':   r'from\s+distutils|import\s+distutils',
        'severity':  'high',
        'category':  'deprecated',
        'message':   'distutils removido en Python 3.12',
        'suggestion':'Usar setuptools directamente',
    },
    {
        'pattern':   r'\.has_key\(',
        'severity':  'high',
        'category':  'outdated',
        'message':   'dict.has_key() removido en Python 3',
        'suggestion':'Usar "key in dict"',
    },
    {
        'pattern':   r'except\s+\w+\s*,\s*\w+\s*:',
        'severity':  'high',
        'category':  'outdated',
        'message':   'Sintaxis except Python 2 — except Error, e:',
        'suggestion':'except Error as e:',
    },
    # ── malas prácticas Python ────────────────────────────────────────────────
    {
        'pattern':   r'except\s*:\s*$|except\s*:\s*#',
        'severity':  'high',
        'category':  'bad_practice',
        'message':   'except desnudo — captura hasta SystemExit y KeyboardInterrupt',
        'suggestion':'except Exception as e: · nunca except sin tipo',
    },
    {
        'pattern':   r'except\s+Exception\s*:\s*$|except\s+Exception\s*:\s*#',
        'severity':  'medium',
        'category':  'bad_practice',
        'message':   'except Exception sin loguear — error silenciado',
        'suggestion':'Agregar logger.warning o console.print en el except',
    },
    {
        'pattern':   r'print\s*\(',
        'severity':  'low',
        'category':  'bad_practice',
        'message':   'print() directo — usar console (rich) o logger',
        'suggestion':'from rich.console import Console · console.print(...)',
    },
    {
        'pattern':   r'time\.sleep\([0-9]+\)',
        'severity':  'low',
        'category':  'performance',
        'message':   'time.sleep() bloqueante en posible contexto async',
        'suggestion':'Verificar si el contexto es async — usar asyncio.sleep()',
    },
    {
        'pattern':   r'open\([^)]+\)(?!\s+as)(?!.*with)',
        'severity':  'medium',
        'category':  'bad_practice',
        'message':   'open() sin context manager — archivo puede no cerrarse',
        'suggestion':'with open(...) as f:',
    },
    {
        'pattern':   r'global\s+\w+',
        'severity':  'low',
        'category':  'bad_practice',
        'message':   'variable global — dificulta testing y threading',
        'suggestion':'Encapsular en clase o pasar como parámetro',
    },
    {
        'pattern':   r'pickle\.',
        'severity':  'high',
        'category':  'security',
        'message':   'pickle — inseguro con datos no confiables',
        'suggestion':'Usar json.dumps/loads para datos simples',
    },
    {
        'pattern':   r'shell\s*=\s*True',
        'severity':  'critical',
        'category':  'security',
        'message':   'subprocess con shell=True — riesgo de inyección de comandos',
        'suggestion':'Pasar lista de argumentos y shell=False',
    },
    {
        'pattern':   r'eval\(',
        'severity':  'critical',
        'category':  'security',
        'message':   'eval() — ejecución de código arbitrario',
        'suggestion':'Eliminar eval — reemplazar con lógica explícita',
    },
    # ── Flask específico ──────────────────────────────────────────────────────
    {
        'pattern':   r'app\.run\(debug\s*=\s*True',
        'severity':  'high',
        'category':  'security',
        'message':   'Flask debug=True en producción expone debugger interactivo',
        'suggestion':'debug=False en producción · usar variable de entorno',
    },
    {
        'pattern':   r'host\s*=\s*["\']0\.0\.0\.0["\']',
        'severity':  'medium',
        'category':  'security',
        'message':   'Flask escuchando en 0.0.0.0 — expuesto a red externa',
        'suggestion':'host="127.0.0.1" si solo es acceso local',
    },
]

# ─── Archivos a ignorar ───────────────────────────────────────────────────────
IGNORE_DIRS = {
    'node_modules', '.git', '__pycache__', 'venv', '.venv',
    'dist', 'build', '.next', 'coverage', 'cython_ext',
    'ai',
}
IGNORE_FILES = {
    'package-lock.json', 'yarn.lock', '*.min.js', '*.d.ts',
}

# ─── Scanner ──────────────────────────────────────────────────────────────────
def _should_ignore(path: Path) -> bool:
    for part in path.parts:
        if part in IGNORE_DIRS:
            return True
    if path.suffix in ('.pyc', '.pyd', '.so', '.dll'):
        return True
    return False

def _issue_id(file: str, line: int, pattern: str) -> str:
    return hashlib.md5(f'{file}:{line}:{pattern}'.encode()).hexdigest()[:10]

def _scan_file(file: Path, rules: list, language: str) -> list[CodeIssue]:
    issues = []
    try:
        lines = file.read_text(encoding='utf-8', errors='ignore').splitlines()
    except Exception:
        return []

    for i, line_text in enumerate(lines, 1):
        stripped = line_text.strip()
        # ignorar líneas comentadas
        if stripped.startswith('#') or stripped.startswith('//'):
            continue

        for rule in rules:
            if re.search(rule['pattern'], line_text):
                rel_path = str(file.relative_to(ROOT_DIR)).replace('\\', '/')
                issues.append(CodeIssue(
                    id         = _issue_id(rel_path, i, rule['pattern']),
                    severity   = rule['severity'],
                    category   = rule['category'],
                    file       = rel_path,
                    line       = i,
                    code       = line_text.strip()[:120],
                    message    = rule['message'],
                    suggestion = rule['suggestion'],
                    language   = language,
                ))

    return issues

def _scan_typescript() -> list[CodeIssue]:
    src_dir = ROOT_DIR / 'src'
    if not src_dir.exists():
        return []
    issues = []
    for f in src_dir.rglob('*.ts'):
        if _should_ignore(f):
            continue
        issues.extend(_scan_file(f, TS_RULES, 'ts'))
    return issues

def _scan_python() -> list[CodeIssue]:
    py_dir = ROOT_DIR / 'python'
    if not py_dir.exists():
        return []
    issues = []
    for f in py_dir.rglob('*.py'):
        if _should_ignore(f):
            continue
        issues.extend(_scan_file(f, PY_RULES, 'python'))
    return issues

# ─── Agrupar por archivo y categoría ─────────────────────────────────────────
def _group_issues(issues: list[CodeIssue]) -> tuple[dict, dict]:
    by_file: dict[str, list] = {}
    by_cat:  dict[str, int]  = {}

    for issue in issues:
        by_file.setdefault(issue.file, []).append(asdict(issue))
        by_cat[issue.category] = by_cat.get(issue.category, 0) + 1

    return by_file, by_cat

# ─── Print ────────────────────────────────────────────────────────────────────
def print_analysis(report: AnalysisReport) -> None:
    COLOR = {
        'critical': 'red',
        'high':     'yellow',
        'medium':   'cyan',
        'low':      'dim',
    }
    ICON = {
        'critical': '✗',
        'high':     '§',
        'medium':   '◆',
        'low':      '·',
    }
    CAT_ICON = {
        'deprecated':   '🗑',
        'bad_practice': '⚠',
        'security':     '🔒',
        'performance':  '⚡',
        'outdated':     '📦',
    }

    if not report.total:
        console.print('  [green]✔ Code Analyzer — código limpio, sin issues[/green]')
        return

    console.print(f'\n  [yellow]◆ Code Analyzer — {report.total} issue(s) · {report.critical} crítico(s)[/yellow]')

    # resumen por categoría
    console.print('  [dim]── categorías ──[/dim]')
    for cat, count in sorted(report.by_category.items(), key=lambda x: -x[1]):
        icon = CAT_ICON.get(cat, '·')
        console.print(f'  [dim]{icon} {cat}: {count}[/dim]')

    # detalle por archivo — solo los que tienen critical/high
    console.print('\n  [dim]── issues críticos/altos ──[/dim]')
    shown = 0
    for file, file_issues in report.by_file.items():
        important = [i for i in file_issues if i['severity'] in ('critical', 'high')]
        if not important:
            continue
        console.print(f'\n  [bold]{file}[/bold]')
        for issue in important[:5]:  # max 5 por archivo
            sev   = issue['severity']
            color = COLOR.get(sev, 'white')
            icon  = ICON.get(sev, '·')
            console.print(f'    [{color}]{icon} L{issue["line"]} {issue["message"]}[/{color}]')
            console.print(f'      [dim]→ {issue["suggestion"]}[/dim]')
            shown += 1

    remaining = report.total - shown
    if remaining > 0:
        console.print(f'\n  [dim]· {remaining} issue(s) medium/low — revisar {ANALYSIS_LOG.name}[/dim]')

    console.print()

# ─── Save ─────────────────────────────────────────────────────────────────────
def _save(report: AnalysisReport) -> None:
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        ANALYSIS_LOG.write_text(json.dumps(asdict(report), indent=2))
    except Exception as e:
        console.print(f'  [red]✗ CodeAnalyzer save error: {e}[/red]')

# ─── Runner ───────────────────────────────────────────────────────────────────
def run_analysis() -> AnalysisReport:
    ts_issues = _scan_typescript()
    py_issues = _scan_python()
    all_issues = ts_issues + py_issues

    # deduplicar por id
    seen: set[str] = set()
    unique = []
    for issue in all_issues:
        if issue.id not in seen:
            seen.add(issue.id)
            unique.append(issue)

    by_file, by_cat = _group_issues(unique)

    report = AnalysisReport(
        timestamp   = datetime.utcnow().isoformat(),
        total       = len(unique),
        critical    = sum(1 for i in unique if i.severity == 'critical'),
        by_file     = by_file,
        by_category = by_cat,
        issues      = [asdict(i) for i in unique],
    )
    _save(report)
    return report

def run_once() -> AnalysisReport:
    return run_analysis()