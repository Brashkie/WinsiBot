/**
 * Handler Híbrido Optimizado - WinsiBot V3.0.0 TypeScript Edition
 * Combinando lo mejor de: HepeinBot-PRO + Sasuke-Bot + Black-Clover + Avenix-Multi
 * 
 * Características principales:
 * ✅ Optimizado para Termux con TypeScript
 * ✅ Tipado estático completo
 * ✅ Interfaces bien definidas
 * ✅ IntelliSense mejorado
 * ✅ Detección de errores en tiempo de compilación
 * ✅ Código más mantenible y escalable
 */

import { smsg } from './lib/simple.js';
import { format } from 'util';
import { fileURLToPath } from 'url';
import path, { join } from 'path';
import { unwatchFile, watchFile } from 'fs';
import chalk from 'chalk';
import moment from 'moment-timezone';
import cron from 'node-cron';
import { 
    WASocket, 
    WAMessage, 
    BaileysEventMap,
    GroupMetadata,
    WAMessageKey,
    ConnectionState
} from '@whiskeysockets/baileys';

// ═══════════════════════════════════════════════════════════════════════════════
// │                           INTERFACES DE TYPESCRIPT                         │
// ═══════════════════════════════════════════════════════════════════════════════

interface UserData {
    // Datos esenciales
    exp: number;
    money: number;
    limit: number;
    level: number;
    lastSeen: number;
    
    // Información personal
    registered: boolean;
    name: string;
    age: number;
    regTime: number;
    
    // Estados y configuraciones
    banned: boolean;
    premium: boolean;
    premiumTime: number;
    afk: number;
    afkReason: string;
    muto?: boolean;
    
    // Sistema de roles
    role: string;
    autolevelup: boolean;
    
    // Sistema económico
    bank: number;
    atm: number;
    fullatm: number;
    diamond: number;
    joincount: number;
    
    // Datos de juego/RPG
    health: number;
    warn: number;
    
    // Cooldowns
    lastcommand: number;
    lastclaim: number;
    lastadventure?: number;
    lastduel?: number;
    lastmining?: number;
    lastfishing?: number;
    
    // Sistema de cumpleaños
    birthday: {
        date: string;
        announce: boolean;
        timezone: string;
    };
    
    // Cache interno
    _birthday?: any;
    lastCacheUpdate?: number;
}

interface ChatData {
    // Configuraciones básicas
    isBanned: boolean;
    welcome: boolean;
    detect: boolean;
    modoadmin: boolean;
    expired: number;
    
    // Sistema anti-lag
    antiLag: boolean;
    per: string[];
    
    // Funcionalidades especiales
    birthdayAllowed?: boolean;
    
    // Mensajes personalizados
    sWelcome?: string;
    sBye?: string;
    sPromote?: string;
    sDemote?: string;
    sDesc?: string;
    sSubject?: string;
    sRevoke?: string;
    
    // Sistemas de protección
    antiLink: boolean;
    antiLink2?: boolean;
    viewonce?: boolean;
    antiToxic?: boolean;
    antiTraba?: boolean;
    antiFake?: boolean;
    antiSpam?: boolean;
    antiFlood?: boolean;
    antidelete?: boolean;
    delete?: boolean;
    
    // Funcionalidades adicionales
    autosticker?: boolean;
    audios: boolean;
    reaction?: boolean;
    game: boolean;
    rpg?: boolean;
    nsfw: boolean;
    modohorny?: boolean;
    autosimi?: boolean;
    
    // Anti-enlaces específicos
    antiTelegram?: boolean;
    antiDiscord?: boolean;
    antiTiktok?: boolean;
    antiYoutube?: boolean;
}

interface BotSettings {
    self: boolean;
    autoread: boolean;
    restrict: boolean;
    antiCall: boolean;
    antiPrivate: boolean;
    jadibotmd: boolean;
    antiSpam?: boolean;
    antiTraba?: boolean;
    backup?: boolean;
    pconly?: boolean;
    gconly?: boolean;
    swonly?: boolean;
    status: number;
    jadibot?: boolean;
    actives: string[]; // Para subbots premium
}

interface PluginStats {
    total: number;
    success: number;
    last: number;
    lastSuccess: number;
}

interface DatabaseSchema {
    users: { [userId: string]: UserData };
    chats: { [chatId: string]: ChatData };
    settings: { [botId: string]: BotSettings };
    stats: { [pluginName: string]: PluginStats };
}

interface TermuxConfig {
    MESSAGE_DELAY: number;
    COMMAND_COOLDOWN: number;
    MAX_CONCURRENT_OPERATIONS: number;
    MEMORY_CLEANUP_INTERVAL: number;
    MAX_CACHED_USERS: number;
    MAX_TEMP_OBJECTS: number;
    BATCH_SIZE: number;
    MAX_RETRIES: number;
}

interface Plugin {
    command?: string | string[] | RegExp;
    rowner?: boolean;
    owner?: boolean;
    mods?: boolean;
    premium?: boolean;
    premsub?: boolean;
    group?: boolean;
    botAdmin?: boolean;
    admin?: boolean;
    private?: boolean;
    register?: boolean;
    nsfw?: boolean;
    limit?: number;
    level?: number;
    money?: number;
    exp?: number;
    disabled?: boolean;
    tags?: string[];
    customPrefix?: string | RegExp | (string | RegExp)[];
    fail?: (type: string, m: any, conn: any) => void;
    before?: (m: any, extra: any) => Promise<boolean>;
    after?: (m: any, extra: any) => Promise<void>;
    all?: (m: any, extra: any) => Promise<void>;
    handler?: (m: any, extra: any) => Promise<void>;
    [key: string]: any;
}

interface ExtendedWAMessage extends WAMessage {
    exp: number;
    limit: boolean | number;
    money: boolean | number;
    plugin?: string;
    usedPrefix?: string;
    args?: string[];
    _args?: string[];
    text?: string;
    command?: string;
    isOwner?: boolean;
    isROwner?: boolean;
    isMods?: boolean;
    isPrems?: boolean;
    isPremSubs?: boolean;
    isCommand?: boolean;
    error?: Error;
    commandFound?: boolean;
}

interface CachedUserData {
    data: Partial<UserData>;
    lastCacheUpdate: number;
}

interface BirthdayCache {
    lastCheck: string | null;
    processing: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// │                    CONFIGURACIONES OPTIMIZADAS PARA TERMUX                 │
// ═══════════════════════════════════════════════════════════════════════════════

const TERMUX_CONFIG: TermuxConfig = {
    MESSAGE_DELAY: 1500,
    COMMAND_COOLDOWN: 2500,
    MAX_CONCURRENT_OPERATIONS: 2,
    MEMORY_CLEANUP_INTERVAL: 300000, // 5 minutos
    MAX_CACHED_USERS: 100,
    MAX_TEMP_OBJECTS: 50,
    BATCH_SIZE: 3,
    MAX_RETRIES: 2
};

const { proto } = (await import('@whiskeysockets/baileys')).default;
const isNumber = (x: any): x is number => typeof x === 'number' && !isNaN(x);
const delay = (ms: number): Promise<void> => isNumber(ms) && new Promise(resolve => setTimeout(() => {
    resolve();
}, ms));

// ═══════════════════════════════════════════════════════════════════════════════
// │                        POOL DE OBJETOS OPTIMIZADO                          │
// ═══════════════════════════════════════════════════════════════════════════════

class OptimizedPool {
    private objects: Record<string, any>[] = [];
    private users: Map<string, CachedUserData> = new Map();
    private lastCleanup: number = Date.now();
    
    getObject(): Record<string, any> {
        return this.objects.pop() || {};
    }
    
    returnObject(obj: Record<string, any>): void {
        if (this.objects.length < TERMUX_CONFIG.MAX_TEMP_OBJECTS) {
            Object.keys(obj).forEach(key => delete obj[key]);
            this.objects.push(obj);
        }
    }
    
    getUserCache(userId: string): CachedUserData | undefined {
        return this.users.get(userId);
    }
    
    setUserCache(userId: string, userData: CachedUserData): void {
        if (this.users.size >= TERMUX_CONFIG.MAX_CACHED_USERS) {
            const firstKey = this.users.keys().next().value;
            if (firstKey) this.users.delete(firstKey);
        }
        this.users.set(userId, userData);
    }
    
    cleanup(): void {
        const now = Date.now();
        if (now - this.lastCleanup > TERMUX_CONFIG.MEMORY_CLEANUP_INTERVAL) {
            // Limpiar cache de usuarios no activos
            const cutoffTime = now - (30 * 60 * 1000); // 30 minutos
            for (let [userId, data] of this.users.entries()) {
                if (!data.data.lastSeen || data.data.lastSeen < cutoffTime) {
                    this.users.delete(userId);
                }
            }
            
            // Limpiar objetos temporales
            this.objects = this.objects.slice(0, Math.floor(TERMUX_CONFIG.MAX_TEMP_OBJECTS / 2));
            
            // Forzar garbage collection si está disponible
            if (global.gc) {
                global.gc();
                console.log(chalk.green('🧹 Limpieza de memoria automática ejecutada'));
            }
            
            this.lastCleanup = now;
        }
    }
}

const memoryPool = new OptimizedPool();

// Limpieza automática optimizada para Termux
setInterval(() => memoryPool.cleanup(), TERMUX_CONFIG.MEMORY_CLEANUP_INTERVAL);

// ═══════════════════════════════════════════════════════════════════════════════
// │                    INICIALIZACIÓN EFICIENTE DE USUARIOS                    │
// ═══════════════════════════════════════════════════════════════════════════════

function initializeUserEfficient(user: UserData, sender: string, name: string): UserData {
    // Verificar cache primero
    const cachedUser = memoryPool.getUserCache(sender);
    if (cachedUser && (Date.now() - cachedUser.lastCacheUpdate) < 60000) { // Cache válido por 1 minuto
        return Object.assign(user, cachedUser.data);
    }
    
    // Inicialización por niveles - solo lo esencial primero
    const essentials: Partial<UserData> = {
        // Nivel 1: Absolutamente esencial
        exp: user.exp ?? 0,
        money: user.money ?? 100,
        limit: user.limit ?? 15,
        level: user.level ?? 0,
        lastSeen: Date.now(),
        
        // Nivel 2: Sistema básico
        registered: user.registered ?? false,
        name: user.name ?? name,
        banned: user.banned ?? false,
        premium: user.premium ?? false,
        afk: user.afk ?? -1,
        
        // Nivel 3: Cooldowns esenciales (inicializar solo si es necesario)
        lastcommand: user.lastcommand ?? 0,
        lastclaim: user.lastclaim ?? 0,
    };
    
    // Asignar solo propiedades esenciales
    Object.assign(user, essentials);
    
    // Inicialización lazy para propiedades complejas
    if (!user.birthday && typeof user.birthday !== 'object') {
        Object.defineProperty(user, 'birthday', {
            get() {
                if (!this._birthday) {
                    this._birthday = {
                        date: '',
                        announce: true,
                        timezone: 'America/Mexico_City'
                    };
                }
                return this._birthday;
            },
            set(value) {
                this._birthday = value;
            },
            enumerable: true,
            configurable: true
        });
    }
    
    // Cache del usuario inicializado
    memoryPool.setUserCache(sender, {
        data: { ...essentials },
        lastCacheUpdate: Date.now()
    });
    
    return user;
}

function initializeChatEfficient(chat: ChatData): ChatData {
    // Propiedades mínimas para funcionamiento básico
    const essentials: Partial<ChatData> = {
        isBanned: chat.isBanned ?? false,
        welcome: chat.welcome !== false, // true por defecto
        detect: chat.detect !== false,   // true por defecto
        modoadmin: chat.modoadmin ?? false,
        
        // Sistema anti-lag optimizado
        antiLag: chat.antiLag ?? false,
        per: Array.isArray(chat.per) ? chat.per : [],
        
        // Propiedades básicas de protección
        antiLink: chat.antiLink ?? false,
        expired: chat.expired ?? 0,
        audios: chat.audios !== false,
        game: chat.game !== false,
        nsfw: chat.nsfw ?? false
    };
    
    Object.assign(chat, essentials);
    return chat;
}

// ═══════════════════════════════════════════════════════════════════════════════
// │                    SISTEMA DE COMANDOS SIMILARES OPTIMIZADO                │
// ═══════════════════════════════════════════════════════════════════════════════

class CommandSuggestionSystem {
    private commandCache: Map<string, string> = new Map();
    private lastUpdate: number = 0;
    
    getAllCommands(): string[] {
        const now = Date.now();
        // Actualizar cache cada 5 minutos
        if (!this.commandCache.size || now - this.lastUpdate > 300000) {
            this.updateCommandCache();
            this.lastUpdate = now;
        }
        
        return Array.from(this.commandCache.keys());
    }
    
    private updateCommandCache(): void {
        this.commandCache.clear();
        
        for (let name in global.plugins) {
            const plugin: Plugin = global.plugins[name];
            if (!plugin || plugin.disabled) continue;
            
            if (plugin.command) {
                if (typeof plugin.command === 'string') {
                    this.commandCache.set(plugin.command, name);
                } else if (Array.isArray(plugin.command)) {
                    plugin.command.forEach((cmd: string | RegExp) => {
                        if (typeof cmd === 'string') {
                            this.commandCache.set(cmd, name);
                        }
                    });
                }
            }
        }
    }
    
    findSimilar(attempt: string, maxSuggestions: number = 3): string[] {
        const commands = this.getAllCommands();
        const suggestions: string[] = [];
        const attemptLower = attempt.toLowerCase();
        
        // Búsqueda exacta parcial (más eficiente)
        for (const cmd of commands) {
            if (cmd.toLowerCase().includes(attemptLower)) {
                suggestions.push(cmd);
                if (suggestions.length >= maxSuggestions) break;
            }
        }
        
        return suggestions;
    }
}

const commandSuggester = new CommandSuggestionSystem();

// ═══════════════════════════════════════════════════════════════════════════════
// │                    SISTEMA DE CUMPLEAÑOS EFICIENTE                         │
// ═══════════════════════════════════════════════════════════════════════════════

let birthdayCheckCache: BirthdayCache = {
    lastCheck: null,
    processing: false
};

export async function checkBirthdays(this: WASocket): Promise<void> {
    if (!this || birthdayCheckCache.processing) return;
    
    const today = new Date();
    const todayString = `${today.getDate()}/${today.getMonth() + 1}`;
    
    if (birthdayCheckCache.lastCheck === todayString) return;
    
    birthdayCheckCache.processing = true;
    birthdayCheckCache.lastCheck = todayString;
    
    try {
        // Procesamiento en lotes para evitar sobrecarga
        const chats = Object.keys((global as any).db.data.chats || {});
        const batches: string[][] = [];
        
        for (let i = 0; i < chats.length; i += TERMUX_CONFIG.BATCH_SIZE) {
            batches.push(chats.slice(i, i + TERMUX_CONFIG.BATCH_SIZE));
        }
        
        for (const batch of batches) {
            await Promise.all(batch.map(async (chatId: string) => {
                const chat: ChatData = (global as any).db.data.chats[chatId];
                if (!chat?.birthdayAllowed || !chatId.endsWith('@g.us')) return;
                
                try {
                    const groupMetadata = await this.groupMetadata(chatId).catch(() => null);
                    if (!groupMetadata) return;
                    
                    // Procesar cumpleaños de forma eficiente
                    await this.processBirthdaysForGroup(chatId, groupMetadata, today);
                } catch (error) {
                    console.error(`Error checking birthday for ${chatId}:`, error);
                }
            }));
            
            // Pausa entre lotes para no sobrecargar Termux
            await new Promise(resolve => setTimeout(resolve, TERMUX_CONFIG.MESSAGE_DELAY));
        }
        
        console.log(chalk.blue('✅ Verificación de cumpleaños completada'));
    } finally {
        birthdayCheckCache.processing = false;
    }
}

// Programar verificación diaria (optimizada para Termux)
cron.schedule('0 9 * * *', async () => {
    if ((global as any).conn && !birthdayCheckCache.processing) {
        console.log(chalk.blue('🎂 Iniciando verificación diaria de cumpleaños...'));
        await checkBirthdays.call((global as any).conn);
    }
}, {
    scheduled: true,
    timezone: "America/Mexico_City"
});

// ═══════════════════════════════════════════════════════════════════════════════
// │                        HANDLER PRINCIPAL OPTIMIZADO                        │
// ═══════════════════════════════════════════════════════════════════════════════

export async function handler(this: WASocket, chatUpdate: BaileysEventMap['messages.upsert']): Promise<void> {
    this.msgqueque = this.msgqueque || [];
    this.uptime = this.uptime || Date.now();
    
    if (!chatUpdate?.messages?.length) return;
    
    this.pushMessage(chatUpdate.messages).catch(console.error);
    let m = chatUpdate.messages[chatUpdate.messages.length - 1] as ExtendedWAMessage;
    if (!m) return;
    
    if ((global as any).db.data == null) await (global as any).loadDatabase();
    
    try {
        m = smsg(this, m) || m;
        if (!m) return;
        
        m.exp = 0;
        m.limit = false;
        m.money = false;
        
        try {
            // ═══════════════════════════════════════════════════════════════════
            // │                    SISTEMA ANTI-LAG HÍBRIDO                     │
            // ═══════════════════════════════════════════════════════════════════
            
            const db = (global as any).db.data as DatabaseSchema;
            const chat: ChatData = db.chats[m.key.remoteJid!] || {} as ChatData;
            const mainBot: string | undefined = (global as any)?.conn?.user?.jid;
            const isAntiLagActive: boolean = chat.antiLag === true;
            const allowedBots: string[] = chat.per || [];
            
            // Auto-incluir bot principal
            if (mainBot && !allowedBots.includes(mainBot)) {
                allowedBots.push(mainBot);
                chat.per = allowedBots;
            }
            
            // Verificación optimizada para subbots
            const isAllowedBot: boolean = allowedBots.includes(this.user?.jid || '');
            if (isAntiLagActive && !isAllowedBot) return;
            
            // ═══════════════════════════════════════════════════════════════════
            // │                    INICIALIZACIÓN INTELIGENTE                   │
            // ═══════════════════════════════════════════════════════════════════
            
            // Usuarios: inicialización eficiente
            let user: UserData = db.users[m.key.participant || m.key.remoteJid!];
            if (typeof user !== 'object') {
                db.users[m.key.participant || m.key.remoteJid!] = {} as UserData;
                user = db.users[m.key.participant || m.key.remoteJid!];
            }
            
            initializeUserEfficient(user, m.key.participant || m.key.remoteJid!, m.pushName || 'Usuario');
            
            // Chats: inicialización mínima
            if (typeof chat !== 'object') {
                db.chats[m.key.remoteJid!] = {} as ChatData;
            }
            initializeChatEfficient(chat);
            db.chats[m.key.remoteJid!] = chat;
            
            // Configuraciones del bot
            let settings: BotSettings = db.settings[this.user?.jid || ''];
            if (typeof settings !== 'object') {
                db.settings[this.user?.jid || ''] = {
                    self: false,
                    autoread: false,
                    restrict: false,
                    antiCall: false,
                    antiPrivate: false,
                    jadibotmd: true,
                    status: 0,
                    actives: [] // Para subbots premium
                };
                settings = db.settings[this.user?.jid || ''];
            }
            
        } catch (e) {
            console.error('Error inicializando datos:', e);
        }

        // ═══════════════════════════════════════════════════════════════════════
        // │                    VERIFICACIONES DE PRIVILEGIOS                   │
        // ═══════════════════════════════════════════════════════════════════════
        
        const sender: string = m.key.participant || m.key.remoteJid!;
        const detectwhat: '@lid' | '@s.whatsapp.net' = sender.includes('@lid') ? '@lid' : '@s.whatsapp.net';
        const sendNum: string = sender.replace(/[^0-9]/g, '');
        
        const isROwner: boolean = [this.decodeJid((global as any).conn?.user?.id), ...(global as any).owner.map(([number]: [string]) => number)]
            .map((v: string) => v.replace(/[^0-9]/g, '') + detectwhat)
            .includes(sender);
            
        const isOwner: boolean = isROwner || m.key.fromMe;
        const isMods: boolean = isOwner || (global as any).mods.map((v: string) => v.replace(/[^0-9]/g, '') + detectwhat).includes(sender);
        const isPrems: boolean = isROwner || user.premiumTime > 0;
        
        // Sistema premium subbots
        const dbSubsPrems: BotSettings = settings || {} as BotSettings;
        const subsActivos: string[] = dbSubsPrems.actives || [];
        const botIds: string[] = [this.user?.id, this.user?.lid, ...(global as any).owner.map(([n]: [string]) => n)]
            .map((jid: string) => jid?.replace(/[^0-9]/g, '')).filter(Boolean);
            
        const isPremSubs: boolean = subsActivos.some((jid: string) => jid.replace(/[^0-9]/g, '') === sendNum) || 
                          botIds.includes(sendNum) || 
                          ((global as any).conns || []).some((conn: any) => 
                              conn?.user?.jid?.replace(/[^0-9]/g, '') === sendNum && 
                              conn?.ws?.socket?.readyState !== 3
                          );

        // Control de cola optimizado para Termux
        if ((global as any).opts['queque'] && m.message && !(isMods || isPrems)) {
            let queque: string[] = this.msgqueque;
            const time: number = TERMUX_CONFIG.MESSAGE_DELAY;
            const previousID: string = queque[queque.length - 1];
            queque.push(m.key.id!);
            
            setInterval(async function (this: NodeJS.Timeout) {
                if (queque.indexOf(previousID) === -1) clearInterval(this);
                await delay(time);
            }, time);
        }

        // Filtros básicos
        if ((m as any).isBaileys) return;
        if ((global as any).opts['nyimak']) return;
        if (!isROwner && (global as any).opts['self']) return;
        if ((global as any).opts['pconly'] && m.key.remoteJid?.endsWith('g.us')) return;
        if ((global as any).opts['gconly'] && !m.key.remoteJid?.endsWith('g.us')) return;
        
        const messageText: string = (m as any).text || '';

        // Anti-spam optimizado
        if (user.lastcommand && new Date().getTime() - user.lastcommand < TERMUX_CONFIG.COMMAND_COOLDOWN && !isOwner) {
            console.log(`Rate limited: ${sender}`);
            return;
        }

        m.exp += Math.ceil(Math.random() * 10);

        // ═══════════════════════════════════════════════════════════════════════
        // │                    DETECCIÓN DE ADMIN/GRUPO                        │
        // ═══════════════════════════════════════════════════════════════════════
        
        let groupMetadata: GroupMetadata | {} = {};
        let participants: any[] = [];
        let isAdmin: boolean = false;
        let isBotAdmin: boolean = false;
        
        if (m.key.remoteJid?.endsWith('@g.us')) {
            groupMetadata = await this.groupMetadata(m.key.remoteJid).catch(() => ({}));
            participants = (groupMetadata as GroupMetadata).participants || [];
            
            // Función helper para normalizar JIDs
            const normalizeJid = (jid: string): string => jid?.replace(/[^0-9]/g, '');
            const cleanJid = (jid: string): string => jid?.split(':')[0] || '';
            const senderNum: string = normalizeJid(sender);
            const botNums: string[] = [this.user?.jid, this.user?.lid].map((j: string) => normalizeJid(cleanJid(j)));
            
            const userParticipant = participants.find(
                (p: any) => normalizeJid(p?.id || p?.jid) === senderNum
            ) || {};
            
            const botParticipant = participants.find(
                (p: any) => botNums.includes(normalizeJid(p?.id || p?.jid))
            ) || {};
            
            isAdmin = userParticipant.admin === 'admin' || userParticipant.admin === 'superadmin';
            isBotAdmin = !!botParticipant.admin;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // │                    PROCESAMIENTO DE PLUGINS                        │
        // ═══════════════════════════════════════════════════════════════════════
        
        const ___dirname: string = path.join(path.dirname(fileURLToPath(import.meta.url)), './plugins');
        let commandFound: boolean = false;
        
        for (let name in (global as any).plugins) {
            let plugin: Plugin = (global as any).plugins[name];
            if (!plugin || plugin.disabled) continue;
            
            const __filename: string = join(___dirname, name);
            
            // Ejecutar plugin.all si existe
            if (typeof plugin.all === 'function') {
                try {
                    await plugin.all.call(this, m, {
                        chatUpdate,
                        __dirname: ___dirname,
                        __filename
                    });
                } catch (e) {
                    console.error(`Error en plugin.all de ${name}:`, e);
                }
            }

            if (!(global as any).opts['restrict'] && plugin.tags?.includes('admin')) continue;
            
            // Detección de prefijos mejorada
            const str2Regex = (str: string): string => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
            let _prefix: string | RegExp | (string | RegExp)[] = plugin.customPrefix || this.prefix || (global as any).prefix;
            let match = (_prefix instanceof RegExp ? 
                [[_prefix.exec(messageText), _prefix]] :
                Array.isArray(_prefix) ?
                    _prefix.map((p: string | RegExp) => {
                        let re = p instanceof RegExp ? p : new RegExp(str2Regex(p));
                        return [re.exec(messageText), re];
                    }) :
                    typeof _prefix === 'string' ?
                        [[new RegExp(str2Regex(_prefix)).exec(messageText), new RegExp(str2Regex(_prefix))]] :
                        [[[], new RegExp]]
            ).find((p: any) => p[1]);

            // Ejecutar plugin.before si existe
            if (typeof plugin.before === 'function') {
                if (await plugin.before.call(this, m, {
                    match, conn: this, participants, groupMetadata,
                    user: user, bot: settings, isROwner, isOwner, isAdmin, isBotAdmin, isPrems,
                    chatUpdate, __dirname: ___dirname, __filename
                })) continue;
            }

            if (typeof plugin !== 'function') continue;

            let usedPrefix: string = (match[0] || '')[0];
            if (usedPrefix) {
                let noPrefix: string = messageText.replace(usedPrefix, '');
                let [command, ...args]: string[] = noPrefix.trim().split` `.filter(v => v);
                args = args || [];
                let _args: string[] = noPrefix.trim().split` `.slice(1);
                let text: string = _args.join` `;
                command = (command || '').toLowerCase();

                let fail = plugin.fail || (global as any).dfail;
                let isAccept: boolean = plugin.command instanceof RegExp ? 
                    plugin.command.test(command) :
                    Array.isArray(plugin.command) ?
                        plugin.command.some((cmd: string | RegExp) => cmd instanceof RegExp ? (cmd as RegExp).test(command) : cmd === command) :
                        typeof plugin.command === 'string' ? plugin.command === command : false;

                if (!isAccept) continue;

                commandFound = true;
                m.plugin = name;

                // Verificaciones de restricciones
                const db = (global as any).db.data as DatabaseSchema;
                if (m.key.remoteJid! in db.chats || sender in db.users) {
                    let chatData: ChatData = db.chats[m.key.remoteJid!];
                    let userData: UserData = db.users[sender];
                    
                    if (!['owner-unbanchat.js'].includes(name) && chatData?.isBanned && !isROwner) return;
                    if (name !== 'owner-unbanuser.js' && userData?.banned && !isROwner) {
                        await this.sendMessage(m.key.remoteJid!, { text: '🚫 Estás baneado y no puedes usar comandos.' });
                        return;
                    }
                }

                // Modo admin
                if (chat.modoadmin && !isOwner && !isROwner && m.key.remoteJid?.endsWith('@g.us') && !isAdmin) return;

                // Verificaciones de permisos (optimizadas)
                const permissionChecks: Array<[boolean, string]> = [
                    [plugin.rowner === true && !isROwner, 'rowner'],
                    [plugin.owner === true && !isOwner, 'owner'],
                    [plugin.mods === true && !isMods, 'mods'],
                    [plugin.premium === true && !isPrems, 'premium'],
                    [plugin.premsub === true && !isPremSubs, 'premsub'],
                    [plugin.group === true && !m.key.remoteJid?.endsWith('@g.us'), 'group'],
                    [plugin.botAdmin === true && !isBotAdmin, 'botAdmin'],
                    [plugin.admin === true && !isAdmin, 'admin'],
                    [plugin.private === true && m.key.remoteJid?.endsWith('@g.us'), 'private'],
                    [plugin.register === true && !user.registered, 'unreg']
                ];

                for (let [condition, failType] of permissionChecks) {
                    if (condition) {
                        fail(failType, m, this);
                        return;
                    }
                }

                m.isCommand = true;

                // Sistema de límites optimizado
                let xp: number = plugin.exp ? parseInt(plugin.exp.toString()) : 10;
                if (xp > 200) {
                    await this.sendMessage(m.key.remoteJid!, { text: '⚠️ Límite de experiencia excedido' });
                    continue;
                }
                
                m.exp += xp;

                // Verificar recursos necesarios
                if (!isPrems && plugin.money && user.money < plugin.money * 1) {
                    await this.sendMessage(m.key.remoteJid!, { text: `💰 Necesitas $${plugin.money} para usar este comando` });
                    continue;
                }

                if (!isPrems && plugin.limit && user.limit < plugin.limit * 1) {
                    await this.sendMessage(m.key.remoteJid!, { text: `💎 Necesitas ${plugin.limit} límites para usar este comando` });
                    continue;
                }

                // Actualizar cooldown
                user.lastcommand = new Date().getTime();

                const extra = {
                    match, usedPrefix, noPrefix, _args, args, command, text,
                    conn: this, participants, groupMetadata, user, bot: settings,
                    isROwner, isOwner, isAdmin, isBotAdmin, isPrems, isPremSubs,
                    chatUpdate, __dirname: ___dirname, __filename
                };

                try {
                    // Ejecutar plugin principal
                    await plugin.call(this, m, extra);
                    
                    // Descontar recursos
                    if (!isPrems) {
                        m.limit = m.limit || plugin.limit || false;
                        m.money = m.money || plugin.money || false;
                    }
                } catch (e) {
                    m.error = e as Error;
                    console.error(`Error en plugin ${name}:`, e);
                    
                    // Ocultar API keys en logs
                    let errorText = format(e);
                    for (let key of Object.values((global as any).APIKeys || {})) {
                        errorText = errorText.replace(new RegExp(key, 'g'), '#HIDDEN#');
                    }
                    
                    await this.sendMessage(m.key.remoteJid!, { text: '❌ Error ejecutando comando' });
                } finally {
                    // Ejecutar plugin.after si existe
                    if (typeof plugin.after === 'function') {
                        try {
                            await plugin.after.call(this, m, extra);
                        } catch (e) {
                            console.error(`Error en plugin.after de ${name}:`, e);
                        }
                    }
                    
                    // Notificar uso de recursos
                    if (m.limit) {
                        await this.sendMessage(m.key.remoteJid!, { text: `Usaste ${+m.limit} límites` });
                    }
                    if (m.money) {
                        await this.sendMessage(m.key.remoteJid!, { text: `Gastaste $${+m.money}` });
                    }
                }
                break;
            }
        }

        // ═══════════════════════════════════════════════════════════════════════
        // │                    DETECCIÓN DE COMANDOS SIMILARES                 │
        // ═══════════════════════════════════════════════════════════════════════
        
        if (!commandFound && messageText && /^[#*./!]/.test(messageText)) {
            let usedPrefixForCheck: string = messageText.match(/^[#*./!]/)?.[0] || '';
            let commandAttempt: string = messageText.replace(usedPrefixForCheck, '').trim().split(' ')[0].toLowerCase();
            
            if (commandAttempt && commandAttempt.length > 1) {
                const suggestions: string[] = commandSuggester.findSimilar(commandAttempt);
                
                let errorMessage = `❌ El comando "${usedPrefixForCheck}${commandAttempt}" no existe.\n\n`;
                errorMessage += `📋 Usa *${usedPrefixForCheck}menu* para ver comandos disponibles.`;
                
                if (suggestions.length > 0) {
                    errorMessage += `\n\n💡 ¿Quisiste decir?\n`;
                    suggestions.forEach(cmd => {
                        errorMessage += `• ${usedPrefixForCheck}${cmd}\n`;
                    });
                }
                
                await this.sendMessage(m.key.remoteJid!, { text: errorMessage });
            }
        }
        
    } catch (e) {
        console.error('Error general en handler:', e);
    } finally {
        // Limpieza final optimizada
        if ((global as any).opts['queque'] && messageText) {
            const quequeIndex: number = this.msgqueque.indexOf(m.key.id!);
            if (quequeIndex !== -1) this.msgqueque.splice(quequeIndex, 1);
        }

        // Actualizar estadísticas de usuario
        const db = (global as any).db.data as DatabaseSchema;
        if (m.key.participant && db.users[m.key.participant]) {
            let userData: UserData = db.users[m.key.participant];
            userData.exp += m.exp || 0;
            userData.limit -= (m.limit as number * 1) || 0;
            userData.money -= (m.money as number * 1) || 0;
        }

        // Actualizar estadísticas de plugins
        if (m.plugin) {
            let stats: { [key: string]: PluginStats } = db.stats || {};
            let now: number = Date.now();
            
            if (!(m.plugin in stats)) {
                stats[m.plugin] = { total: 0, success: 0, last: 0, lastSuccess: 0 };
            }
            
            let stat: PluginStats = stats[m.plugin];
            stat.total += 1;
            stat.last = now;
            
            if (!m.error) {
                stat.success += 1;
                stat.lastSuccess = now;
            }
        }

        // Print logs si está habilitado
        try {
            if (!(global as any).opts['noprint']) {
                await (await import('./lib/print.js')).default(m, this);
            }
        } catch (e) {
            console.log('Error en print:', e);
        }

        // Auto-read optimizado
        const settings: BotSettings = (global as any).db.data.settings[this.user?.jid || ''];
        if ((global as any).opts['autoread'] || settings?.autoread) {
            await this.readMessages([m.key]);
        }
        
        // Limpiar objetos temporales
        if (groupMetadata && typeof groupMetadata === 'object') {
            memoryPool.returnObject(groupMetadata as Record<string, any>);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// │                    HANDLERS ADICIONALES OPTIMIZADOS                       │
// ═══════════════════════════════════════════════════════════════════════════════

export async function participantsUpdate(
    this: WASocket, 
    { id, participants, action }: { id: string; participants: string[]; action: string }
): Promise<void> {
    if ((global as any).opts['self'] || this.isInit) return;
    if ((global as any).db.data == null) await (global as any).loadDatabase();
    
    const chat: ChatData = (global as any).db.data.chats[id] || {};
    if (!chat.welcome) return;
    
    let text: string = '';
    let users: string[] = participants.map(u => this.decodeJid(u));
    
    switch (action) {
        case 'add':
        case 'remove':
            for (let user of users) {
                let pp: string = './src/avatar_contact.png';
                try {
                    pp = await this.profilePictureUrl(user, 'image');
                } catch (e) {}
                
                let welcomeText: string = action === 'add' ? 
                    (chat.sWelcome || 'Bienvenido @user al grupo') :
                    (chat.sBye || 'Adiós @user');
                    
                text = welcomeText.replace('@user', '@' + user.split('@')[0]);
                
                // Envío optimizado para Termux
                await this.sendMessage(id, {
                    text,
                    mentions: [user]
                });
                
                // Delay para evitar spam
                await new Promise(resolve => setTimeout(resolve, TERMUX_CONFIG.MESSAGE_DELAY));
            }
            break;
            
        case 'promote':
        case 'demote':
            text = (action === 'promote' ? 
                (chat.sPromote || '@user ahora es admin') :
                (chat.sDemote || '@user ya no es admin')
            ).replace('@user', '@' + participants[0].split('@')[0]);
            
            if (chat.detect) {
                await this.sendMessage(id, { text, mentions: [participants[0]] });
            }
            break;
    }
}

export async function groupsUpdate(
    this: WASocket,
    updates: Array<{ id: string; desc?: string; subject?: string; revoke?: string }>
): Promise<void> {
    if ((global as any).opts['self']) return;
    
    for (const update of updates) {
        const id: string = update.id;
        if (!id) continue;
        
        let chat: ChatData = (global as any).db.data.chats[id];
        if (!chat?.detect) continue;
        
        let text: string = '';
        
        if (update.desc) {
            text = (chat.sDesc || 'Descripción actualizada:\n@desc').replace('@desc', update.desc);
        } else if (update.subject) {
            text = (chat.sSubject || 'Nombre del grupo actualizado:\n@subject').replace('@subject', update.subject);
        } else if (update.revoke) {
            text = chat.sRevoke || 'Link del grupo restablecido';
        }
        
        if (text) {
            await this.sendMessage(id, { text });
        }
    }
}

export async function deleteUpdate(
    this: WASocket,
    message: { fromMe?: boolean; id: string; participant: string }
): Promise<void> {
    try {
        const { fromMe, id, participant } = message;
        if (fromMe) return;
        
        let msg = this.serializeM(this.loadMessage(id));
        if (!msg) return;
        
        let chat: ChatData = (global as any).db.data.chats[msg.key.remoteJid!] || {};
        if (!chat.delete) return;
        
        let deleteMsg: string = `🗑️ *MENSAJE ELIMINADO*\n\n👤 Usuario: @${participant.split('@')[0]}\n⚠️ Anti-delete activado`;
        
        await this.sendMessage(msg.key.remoteJid!, { text: deleteMsg, mentions: [participant] });
        this.copyNForward(msg.key.remoteJid!, msg).catch(console.error);
    } catch (e) {
        console.error('Error en deleteUpdate:', e);
    }
}

export async function callUpdate(
    this: WASocket,
    callUpdate: Array<{ isGroup: boolean; status: string; from: string }>
): Promise<void> {
    let settings: BotSettings = (global as any).db.data.settings[this.user?.jid || ''];
    if (!settings?.antiCall) return;
    
    for (let call of callUpdate) { 
        if (!call.isGroup && call.status === "offer") {
            await this.sendMessage(call.from, { 
                text: '📞 Las llamadas están prohibidas. Serás bloqueado automáticamente.',
                mentions: [call.from]
            });
            await this.updateBlockStatus(call.from, 'block');
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// │                    FUNCIONES DE UTILIDAD                                  │
// ═══════════════════════════════════════════════════════════════════════════════

(global as any).dfail = (type: string, m: ExtendedWAMessage, conn: WASocket): Promise<any> | undefined => {
    const messages: Record<string, string> = {
        rowner: '🚫 Solo para desarrolladores principales',
        owner: '🚫 Solo para propietarios',
        mods: '🚫 Solo para moderadores',
        premium: '💎 Solo para usuarios premium\n\nContacta al propietario para obtener premium',
        premsub: '⭐ Solo para subbots premium',
        group: '👥 Solo para grupos',
        private: '💬 Solo para chat privado',
        admin: '👑 Solo para administradores',
        botAdmin: '🤖 Necesito ser administrador',
        unreg: '📝 Necesitas registrarte\n\nUsa: *.reg nombre.edad*',
        restrict: '🚫 Función deshabilitada'
    };
    
    if (messages[type]) {
        return conn.sendMessage(m.key.remoteJid!, { 
            text: `${messages[type]}\n\n🤖 *WinsiBot Híbrido TypeScript*` 
        });
    }
};

// Auto-recarga del archivo
const file: string = (global as any).__filename(import.meta.url, true);
watchFile(file, async () => {
    unwatchFile(file);
    console.log(chalk.greenBright("📁 Handler híbrido TypeScript actualizado"));
    if ((global as any).reloadHandler) console.log(await (global as any).reloadHandler());
});

console.log(chalk.blue('🚀 Handler Híbrido TypeScript cargado exitosamente'));
console.log(chalk.green('✅ Optimizado para Termux con tipado estático completo'));
