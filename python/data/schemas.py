from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
import polars as pl

# ─── Schemas Polars ───────────────────────────────────────────────────────────

MESSAGE_SCHEMA = pl.Schema({
    "id":        pl.String,
    "jid":       pl.String,
    "sender":    pl.String,
    "pushName":  pl.String,
    "text":      pl.String,
    "command":   pl.String,
    "isGroup":   pl.Boolean,
    "isOwner":   pl.Boolean,
    "timestamp": pl.String,
})

USER_SCHEMA = pl.Schema({
    "jid":       pl.String,
    "pushName":  pl.String,
    "isOwner":   pl.Boolean,
    "banned":    pl.Boolean,
    "warns":     pl.Int32,
    "exp":       pl.Int64,
    "level":     pl.Int32,
    "premium":   pl.Boolean,
    "createdAt": pl.String,
    "updatedAt": pl.String,
})

GROUP_SCHEMA = pl.Schema({
    "jid":        pl.String,
    "name":       pl.String,
    "antilink":   pl.Boolean,
    "antispam":   pl.Boolean,
    "welcome":    pl.Boolean,
    "muted":      pl.Boolean,
    "createdAt":  pl.String,
    "updatedAt":  pl.String,
})

COMMAND_STATS_SCHEMA = pl.Schema({
    "command":   pl.String,
    "sender":    pl.String,
    "jid":       pl.String,
    "timestamp": pl.String,
    "success":   pl.Boolean,
})

# ─── Dataclasses ──────────────────────────────────────────────────────────────

@dataclass
class MessageRecord:
    id:        str
    jid:       str
    sender:    str
    pushName:  str
    text:      str
    command:   str       = ""
    isGroup:   bool      = False
    isOwner:   bool      = False
    timestamp: str       = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dict(self) -> dict:
        return {
            "id":        self.id,
            "jid":       self.jid,
            "sender":    self.sender,
            "pushName":  self.pushName,
            "text":      self.text,
            "command":   self.command,
            "isGroup":   self.isGroup,
            "isOwner":   self.isOwner,
            "timestamp": self.timestamp,
        }

@dataclass
class UserRecord:
    jid:       str
    pushName:  str       = ""
    isOwner:   bool      = False
    banned:    bool      = False
    warns:     int       = 0
    exp:       int       = 0
    level:     int       = 0
    premium:   bool      = False
    createdAt: str       = field(default_factory=lambda: datetime.utcnow().isoformat())
    updatedAt: str       = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dict(self) -> dict:
        return {
            "jid":       self.jid,
            "pushName":  self.pushName,
            "isOwner":   self.isOwner,
            "banned":    self.banned,
            "warns":     self.warns,
            "exp":       self.exp,
            "level":     self.level,
            "premium":   self.premium,
            "createdAt": self.createdAt,
            "updatedAt": self.updatedAt,
        }

@dataclass
class GroupRecord:
    jid:       str
    name:      str       = ""
    antilink:  bool      = False
    antispam:  bool      = False
    welcome:   bool      = False
    muted:     bool      = False
    createdAt: str       = field(default_factory=lambda: datetime.utcnow().isoformat())
    updatedAt: str       = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dict(self) -> dict:
        return {
            "jid":       self.jid,
            "name":      self.name,
            "antilink":  self.antilink,
            "antispam":  self.antispam,
            "welcome":   self.welcome,
            "muted":     self.muted,
            "createdAt": self.createdAt,
            "updatedAt": self.updatedAt,
        }