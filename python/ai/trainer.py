"""
WinsiBot — MessageTrainer
Pipeline de aprendizaje: Parquet + DuckDB

Flujo:
  record(msg) → buffer en memoria → flush cada 50 msgs o 60 s → Parquet en disco
  get_profile(jid) → DuckDB lee todos los Parquet → UserStyleProfile
  get_group_style(group_jid) → vocabulario y vibe del grupo

Estructura de carpetas:
  data/messages/
    {group_jid_hash}/
      {YYYY-MM}/
        {ts_ms}.parquet

El UserStyleProfile alimenta a imitation.py y personality.py:
  { avg_len, emoji_freq, common_words, active_hours, vocab_sample, uses_slang }
"""

from __future__ import annotations

import re
import hashlib
import threading
import time
import logging
from collections import Counter
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

import pyarrow as pa
import pyarrow.parquet as pq

log = logging.getLogger('trainer')

# ─── Rutas ────────────────────────────────────────────────────────────────────
ROOT_DIR = Path(__file__).parent.parent.parent
MSG_DIR  = ROOT_DIR / 'data' / 'messages'
MSG_DIR.mkdir(parents=True, exist_ok=True)

# ─── Regexes ──────────────────────────────────────────────────────────────────
EMOJI_RE  = re.compile(
    r'[\U0001F300-\U0001FAFF'
    r'\U0001F600-\U0001F64F'
    r'\U0001F680-\U0001F6FF'
    r'☀-➿'
    r'︀-️]+'
)
LINK_RE   = re.compile(r'https?://\S+|wa\.me/\S+')
WORD_RE   = re.compile(r'\b[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]{3,}\b')
SLANG_SET = frozenset({
    'jaja','jeje','jajaja','jajaj','lol','xd','xdd','kkk','we','wey','bro',
    'causa','men','manito','uwu','owo','pls','wtf','omg','bruh','nwn','ñwñ',
    'asere','porfa','porfas','simón','simon','dale','wuach','oe','oye',
})

# ─── Esquema Arrow ────────────────────────────────────────────────────────────
_SCHEMA = pa.schema([
    pa.field('group_jid',   pa.string()),
    pa.field('sender_jid',  pa.string()),
    pa.field('text',        pa.string()),
    pa.field('word_count',  pa.int32()),
    pa.field('char_count',  pa.int32()),
    pa.field('emoji_count', pa.int32()),
    pa.field('has_link',    pa.bool_()),
    pa.field('is_reply',    pa.bool_()),
    pa.field('hour',        pa.int8()),
    pa.field('day_of_week', pa.int8()),
    pa.field('ts',          pa.int64()),
])

# ─── Tipos de salida ──────────────────────────────────────────────────────────
@dataclass
class UserStyleProfile:
    jid:          str
    msg_count:    int   = 0
    avg_len:      float = 20.0
    emoji_freq:   float = 0.15
    common_words: list  = field(default_factory=list)   # top 20 palabras
    active_hours: list  = field(default_factory=list)   # horas de mayor actividad
    vocab_sample: list  = field(default_factory=list)   # últimos 8 msgs cortos como ejemplos
    uses_slang:   bool  = False

@dataclass
class GroupStyleProfile:
    group_jid:    str
    msg_count:    int   = 0
    active_users: list  = field(default_factory=list)   # top 5 más activos
    common_words: list  = field(default_factory=list)   # top 30 palabras del grupo
    avg_msg_len:  float = 20.0
    emoji_freq:   float = 0.15
    vocab_sample: list  = field(default_factory=list)   # 10 msgs representativos
    topics:       list  = field(default_factory=list)   # palabras temáticas frecuentes

# ─── Extracción de features ───────────────────────────────────────────────────
def _extract(group_jid: str, sender_jid: str, text: str, is_reply: bool) -> dict:
    now   = datetime.now(tz=timezone.utc)
    clean = LINK_RE.sub('', text)
    words = WORD_RE.findall(clean.lower())
    emojis = EMOJI_RE.findall(text)
    return {
        'group_jid':   group_jid,
        'sender_jid':  sender_jid,
        'text':        text[:500],
        'word_count':  len(words),
        'char_count':  len(text),
        'emoji_count': len(emojis),
        'has_link':    bool(LINK_RE.search(text)),
        'is_reply':    is_reply,
        'hour':        now.hour,
        'day_of_week': now.weekday(),
        'ts':          int(now.timestamp() * 1000),
    }

# ─── Flush a Parquet ──────────────────────────────────────────────────────────
def _group_key(group_jid: str) -> str:
    return hashlib.md5(group_jid.encode()).hexdigest()[:12]

def _flush(rows: list[dict]) -> None:
    if not rows:
        return
    try:
        by_group: dict[str, list] = {}
        for r in rows:
            by_group.setdefault(r['group_jid'], []).append(r)

        for group_jid, group_rows in by_group.items():
            ts_now  = datetime.now(tz=timezone.utc)
            key     = _group_key(group_jid)
            folder  = MSG_DIR / key / ts_now.strftime('%Y-%m')
            folder.mkdir(parents=True, exist_ok=True)
            out     = folder / f'{int(time.time() * 1000)}.parquet'

            arrays = {col: [] for col in _SCHEMA.names}
            for r in group_rows:
                for col in _SCHEMA.names:
                    arrays[col].append(r[col])

            table = pa.table(arrays, schema=_SCHEMA)
            pq.write_table(table, out, compression='snappy')
    except Exception as e:
        log.error(f'Trainer flush error: {e}')

# ─── DuckDB helpers ───────────────────────────────────────────────────────────
def _duckdb_conn():
    try:
        import duckdb
        return duckdb.connect(':memory:')
    except ImportError:
        return None

def _all_parquet_glob() -> str:
    return str(MSG_DIR / '**' / '**' / '*.parquet')

def _group_parquet_glob(group_jid: str) -> str:
    key = _group_key(group_jid)
    return str(MSG_DIR / key / '**' / '*.parquet')

def _cutoff_ms(days: int = 45) -> int:
    return int((datetime.now(tz=timezone.utc) - timedelta(days=days)).timestamp() * 1000)

# ─── Trainer ─────────────────────────────────────────────────────────────────
class MessageTrainer:
    FLUSH_EVERY_N  = 50      # mensajes en buffer antes de flush
    FLUSH_EVERY_S  = 60      # segundos máximos entre flushes
    MIN_MSGS_PROFILE = 15    # mínimo para generar perfil

    def __init__(self):
        self._buffer: list[dict] = []
        self._lock = threading.Lock()
        self._last_flush = time.time()
        self._start_auto_flush()

    def _start_auto_flush(self) -> None:
        def _loop():
            while True:
                time.sleep(self.FLUSH_EVERY_S)
                self._maybe_flush(force=True)
        t = threading.Thread(target=_loop, daemon=True, name='TrainerFlush')
        t.start()

    def _maybe_flush(self, force: bool = False) -> None:
        with self._lock:
            if not self._buffer:
                return
            elapsed = time.time() - self._last_flush
            if force or len(self._buffer) >= self.FLUSH_EVERY_N or elapsed >= self.FLUSH_EVERY_S:
                rows = list(self._buffer)
                self._buffer.clear()
                self._last_flush = time.time()
        _flush(rows)

    # ─── Pública: registrar mensaje ───────────────────────────────────────
    def record(
        self,
        group_jid:  str,
        sender_jid: str,
        text:       str,
        is_reply:   bool = False,
    ) -> None:
        text = (text or '').strip()
        if not text or len(text) < 2 or text.startswith('!'):
            return
        row = _extract(group_jid, sender_jid, text, is_reply)
        with self._lock:
            self._buffer.append(row)
            should_flush = len(self._buffer) >= self.FLUSH_EVERY_N
        if should_flush:
            self._maybe_flush()

    # ─── Pública: perfil de usuario ───────────────────────────────────────
    def get_profile(self, jid: str, days: int = 45) -> UserStyleProfile:
        profile = UserStyleProfile(jid=jid)
        self._maybe_flush(force=True)

        glob    = _all_parquet_glob()
        cutoff  = _cutoff_ms(days)
        db      = _duckdb_conn()

        # fallback si no hay duckdb: leer Parquet directo con pyarrow
        if db is None:
            return self._profile_from_pyarrow(jid, days)

        try:
            db.execute(f"CREATE VIEW msgs AS SELECT * FROM read_parquet('{glob}', hive_partitioning=false) WHERE ts >= {cutoff}")
        except Exception:
            try:
                db.execute(f"CREATE VIEW msgs AS SELECT * FROM read_parquet('{glob}') WHERE ts >= {cutoff}")
            except Exception:
                return profile

        try:
            row = db.execute(
                "SELECT COUNT(*) as cnt, AVG(char_count) as avg_len, "
                "AVG(CAST(emoji_count > 0 AS INTEGER)) as emoji_freq "
                "FROM msgs WHERE sender_jid = ?",
                [jid]
            ).fetchone()
            if not row or row[0] < self.MIN_MSGS_PROFILE:
                return profile

            profile.msg_count  = int(row[0])
            profile.avg_len    = round(float(row[1] or 20), 1)
            profile.emoji_freq = round(float(row[2] or 0.15), 3)

            # palabras más comunes (excluir stopwords cortas)
            words_res = db.execute(
                "SELECT lower(word), COUNT(*) as freq "
                "FROM msgs, unnest(string_split(regexp_replace(text, '[^a-záéíóúüñA-Z ]', ' '), ' ')) as t(word) "
                "WHERE sender_jid = ? AND length(word) >= 3 "
                "GROUP BY 1 ORDER BY 2 DESC LIMIT 25",
                [jid]
            ).fetchall()
            profile.common_words = [r[0] for r in words_res if r[0]]

            # horas activas (top 5)
            hours_res = db.execute(
                "SELECT hour, COUNT(*) as freq FROM msgs "
                "WHERE sender_jid = ? GROUP BY 1 ORDER BY 2 DESC LIMIT 5",
                [jid]
            ).fetchall()
            profile.active_hours = [int(r[0]) for r in hours_res]

            # muestra de vocabulario: últimos 8 mensajes cortos (<80 chars)
            sample_res = db.execute(
                "SELECT text FROM msgs WHERE sender_jid = ? AND char_count BETWEEN 5 AND 80 "
                "ORDER BY ts DESC LIMIT 8",
                [jid]
            ).fetchall()
            profile.vocab_sample = [r[0] for r in sample_res]

            # detectar slang
            profile.uses_slang = bool(
                SLANG_SET & set(profile.common_words)
            )

        except Exception as e:
            log.warning(f'Trainer get_profile DuckDB error: {e}')
        finally:
            try:
                db.close()
            except Exception:
                pass

        return profile

    # ─── Pública: estilo del grupo ────────────────────────────────────────
    def get_group_style(self, group_jid: str, days: int = 30) -> GroupStyleProfile:
        gstyle = GroupStyleProfile(group_jid=group_jid)
        self._maybe_flush(force=True)

        glob   = _group_parquet_glob(group_jid)
        cutoff = _cutoff_ms(days)
        db     = _duckdb_conn()

        if db is None:
            return gstyle

        try:
            db.execute(f"CREATE VIEW msgs AS SELECT * FROM read_parquet('{glob}') WHERE ts >= {cutoff}")
        except Exception:
            return gstyle

        try:
            row = db.execute(
                "SELECT COUNT(*) as cnt, AVG(char_count) as avg_len, "
                "AVG(CAST(emoji_count > 0 AS INTEGER)) as emoji_freq FROM msgs"
            ).fetchone()
            if not row or row[0] < 10:
                return gstyle

            gstyle.msg_count   = int(row[0])
            gstyle.avg_msg_len = round(float(row[1] or 20), 1)
            gstyle.emoji_freq  = round(float(row[2] or 0.15), 3)

            # usuarios más activos
            active = db.execute(
                "SELECT sender_jid, COUNT(*) as cnt FROM msgs "
                "GROUP BY 1 ORDER BY 2 DESC LIMIT 5"
            ).fetchall()
            gstyle.active_users = [r[0] for r in active]

            # vocabulario del grupo
            words_res = db.execute(
                "SELECT lower(word), COUNT(*) as freq "
                "FROM msgs, unnest(string_split(regexp_replace(text, '[^a-záéíóúüñA-Z ]', ' '), ' ')) as t(word) "
                "WHERE length(word) >= 3 "
                "GROUP BY 1 ORDER BY 2 DESC LIMIT 35"
            ).fetchall()
            gstyle.common_words = [r[0] for r in words_res if r[0]]

            # muestra de mensajes representativos
            sample = db.execute(
                "SELECT text FROM msgs WHERE char_count BETWEEN 5 AND 100 "
                "ORDER BY RANDOM() LIMIT 10"
            ).fetchall()
            gstyle.vocab_sample = [r[0] for r in sample]

        except Exception as e:
            log.warning(f'Trainer get_group_style DuckDB error: {e}')
        finally:
            try:
                db.close()
            except Exception:
                pass

        return gstyle

    # ─── Pública: eliminar datos de un usuario ────────────────────────────
    def delete_user_data(self, jid: str) -> int:
        """Elimina mensajes del usuario de todos los Parquet. Devuelve filas borradas."""
        self._maybe_flush(force=True)
        deleted = 0
        for parquet_file in MSG_DIR.glob('**/*.parquet'):
            try:
                table = pq.read_table(parquet_file)
                mask = [s != jid for s in table.column('sender_jid').to_pylist()]
                if all(mask):
                    continue
                filtered = table.filter(pa.array(mask))
                deleted += len(table) - len(filtered)
                if len(filtered) == 0:
                    parquet_file.unlink(missing_ok=True)
                else:
                    pq.write_table(filtered, parquet_file, compression='snappy')
            except Exception as e:
                log.warning(f'delete_user_data {parquet_file}: {e}')
        return deleted

    # ─── Stats ───────────────────────────────────────────────────────────
    def stats(self) -> dict:
        files = list(MSG_DIR.glob('**/*.parquet'))
        size  = sum(f.stat().st_size for f in files if f.exists())
        return {
            'parquet_files': len(files),
            'disk_mb':       round(size / 1_048_576, 2),
            'buffer_pending': len(self._buffer),
        }

    # ─── Fallback sin DuckDB: pyarrow directo ────────────────────────────
    def _profile_from_pyarrow(self, jid: str, days: int) -> UserStyleProfile:
        profile = UserStyleProfile(jid=jid)
        cutoff  = _cutoff_ms(days)
        rows    = []
        for f in MSG_DIR.glob('**/*.parquet'):
            try:
                t = pq.read_table(f, columns=['sender_jid', 'text', 'char_count', 'emoji_count', 'hour', 'ts'])
                for i in range(len(t)):
                    if t['sender_jid'][i].as_py() == jid and t['ts'][i].as_py() >= cutoff:
                        rows.append({
                            'text':        t['text'][i].as_py(),
                            'char_count':  t['char_count'][i].as_py(),
                            'emoji_count': t['emoji_count'][i].as_py(),
                            'hour':        t['hour'][i].as_py(),
                        })
            except Exception:
                pass

        if len(rows) < self.MIN_MSGS_PROFILE:
            return profile

        profile.msg_count  = len(rows)
        profile.avg_len    = round(sum(r['char_count'] for r in rows) / len(rows), 1)
        profile.emoji_freq = round(sum(1 for r in rows if r['emoji_count'] > 0) / len(rows), 3)

        word_counter: Counter = Counter()
        for r in rows:
            word_counter.update(WORD_RE.findall(r['text'].lower()))
        profile.common_words = [w for w, _ in word_counter.most_common(25)]

        hour_counter: Counter = Counter(r['hour'] for r in rows)
        profile.active_hours = [h for h, _ in hour_counter.most_common(5)]

        profile.vocab_sample = [r['text'] for r in rows if 5 <= r['char_count'] <= 80][:8]
        profile.uses_slang   = bool(SLANG_SET & set(profile.common_words))

        return profile


# ─── Instancia global ─────────────────────────────────────────────────────────
_trainer: Optional[MessageTrainer] = None

def get_trainer() -> MessageTrainer:
    global _trainer
    if _trainer is None:
        _trainer = MessageTrainer()
    return _trainer

def record(group_jid: str, sender_jid: str, text: str, is_reply: bool = False) -> None:
    get_trainer().record(group_jid, sender_jid, text, is_reply)

def get_profile(jid: str, days: int = 45) -> UserStyleProfile:
    return get_trainer().get_profile(jid, days)

def get_group_style(group_jid: str, days: int = 30) -> GroupStyleProfile:
    return get_trainer().get_group_style(group_jid, days)

def delete_user_data(jid: str) -> int:
    return get_trainer().delete_user_data(jid)

def stats() -> dict:
    return get_trainer().stats()
