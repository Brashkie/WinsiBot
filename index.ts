/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * │                        WinsiBot V4.0 - INDEX.JS UNIFICADO                 │
 * │                           Creado por: Hepein Oficial                        │
 * │                          Contacto: +51 916360161                           │
 * │         Bot híbrido superior - Arquitectura empresarial completa           │
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/*process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1';

import './config.js';
import { setupMaster, fork } from 'cluster';
import { watchFile, unwatchFile } from 'fs';
import cfonts from 'cfonts';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { platform } from 'process';
import * as ws from 'ws';
import fs, { 
    readdirSync, statSync, unlinkSync, existsSync, mkdirSync, 
    readFileSync, rmSync, watch 
} from 'fs';
import yargs from 'yargs';
import { spawn } from 'child_process';
import lodash from 'lodash';
import chalk from 'chalk';
import syntaxerror from 'syntax-error';
import { tmpdir } from 'os';
import { format } from 'util';
import boxen from 'boxen';
import P from 'pino';
import pino from 'pino';
import Pino from 'pino';
import path, { join, dirname } from 'path';
import { Boom } from '@hapi/boom';
import { Low, JSONFile } from 'lowdb';
import pkg from 'google-libphonenumber';
import readline, { createInterface } from 'readline';
import NodeCache from 'node-cache';

// Importaciones de Baileys
const { proto } = (await import('@whiskeysockets/baileys')).default;
const { PhoneNumberUtil } = pkg;
const phoneUtil = PhoneNumberUtil.getInstance();
const {
    DisconnectReason, 
    useMultiFileAuthState, 
    MessageRetryMap, 
    fetchLatestBaileysVersion, 
    makeCacheableSignalKeyStore, 
    jidNormalizedUser
} = await import('@whiskeysockets/baileys');

let makeWASocket, protoType, serialize, mongoDB, mongoDBV2, store;
try {
    const libSimple = await import('./lib/simple.js');
    makeWASocket = libSimple.makeWASocket;
    protoType = libSimple.protoType;
    serialize = libSimple.serialize;
    
    const libMongo = await import('./lib/mongoDB.js');
    mongoDB = libMongo.mongoDB;
    mongoDBV2 = libMongo.mongoDBV2;
    
    const libStore = await import('./lib/store.js');
    store = libStore.default;
    
    // Inicializar funciones de lib
    protoType();
    serialize();
} catch (error) {
    console.log(chalk.yellow('⚠️ Algunas librerías no están disponibles, usando funciones estándar'));
}

let winsiBotJadiBot;
try {
    const jadiBotModule = await import('./plugins/jadibot-serbot.js');
    winsiBotJadiBot = jadiBotModule.winsiBotJadiBot || jadiBotModule.blackJadiBot;
} catch (error) {
    console.log(chalk.yellow('⚠️ Plugin jadibot-serbot no encontrado'));
}

const { CONNECTING } = ws;
const { chain } = lodash;
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;
const { say } = cfonts;

async function animarTextoWinsi(texto, delay = 65, glitch = true) {
    const efectos = '▰▱◆◇◈◉●○◐◑◒◓⚡🔥⭐💎🚀';
    let resultado = '';
    
    for (let i = 0; i < texto.length; i++) {
        resultado += texto[i];
        let linea = resultado;
        
        if (glitch) {
            const ruido = efectos[Math.floor(Math.random() * efectos.length)];
            linea += chalk.gray(ruido.repeat(Math.floor(Math.random() * 2)));
        }
        
        process.stdout.write('\r' + chalk.cyanBright(linea));
        await new Promise(res => setTimeout(res, delay));
    }
    console.log();
}

async function barraCargaWinsi() {
    const frames = [
        '[⏳] Inicializando WinsiBot V4.0...',
        '[🔮] Cargando núcleo híbrido...',
        '[💾] Compilando sistemas avanzados...',
        '[⚡] Conectando con Baileys...',
        '[🔥] Optimizando para Termux...',
        '[🌟] Activando funciones superiores...',
        '[🚀] Integrando arquitectura empresarial...',
        '[✅] WINSIBOT V4.0 100% OPERATIVO.'
    ];
    
    for (let frame of frames) {
        process.stdout.write('\r' + chalk.magentaBright(frame));
        await new Promise(res => setTimeout(res, 400));
    }
    console.log();
}

async function animacionRobotWinsi() {
    const frames = [
        `     🤖
    ╭───╮
   ( 💎_💎 )   ACTIVANDO WINSIBOT
   /|▰▰|\\
    ███
   /   \\`,
        `     🤖
    ╭───╮
   ( ⚡_⚡ )   CONECTANDO SISTEMAS
   /|██|\\
    ███
   /   \\`,
        `     🤖
    ╭───╮
   ( 🚀_🚀 )   CARGANDO IA AVANZADA
   /|◆◆|\\
    ███
   /   \\`
    ];
    
    for (let i = 0; i < 4; i++) {
        console.clear();
        console.log(chalk.greenBright(frames[i % frames.length]));
        await new Promise(res => setTimeout(res, 500));
    }
}

async function iniciarWinsiBot() {
    console.clear();
    console.log(chalk.bold.cyanBright('\n⟦ 🚀 ACCESO CONCEDIDO | WINSIBOT V4.0 ⟧'));
    console.log(chalk.gray('🔥 Canalizando poder híbrido superior...'));
    await new Promise(res => setTimeout(res, 800));

    await animarTextoWinsi('💎 Iniciando arquitectura empresarial...', 50, true);
    await new Promise(res => setTimeout(res, 500));

    await barraCargaWinsi();
    await new Promise(res => setTimeout(res, 600));

    console.log(chalk.magentaBright('\n◆◇◆═◆  W  I  N  S  I  B  O  T    V  4 . 0  ◆═◆◇◆'));
    await animarTextoWinsi('⚡ Bienvenido al núcleo híbrido superior...', 60, true);
    console.log(chalk.magentaBright('◆◇◆══════════════════════════════════◆◇◆'));

    await new Promise(res => setTimeout(res, 400));
    await animarTextoWinsi('👑 Desarrollado por: HEPEIN OFICIAL 👑', 50, false);
    await new Promise(res => setTimeout(res, 700));

    console.log(chalk.yellowBright('\n⟦ 🔥 INICIANDO INTERFAZ HÍBRIDA SUPERIOR ⟧'));
    await animacionRobotWinsi();

    await animarTextoWinsi('\n💎 WinsiBot V4.0 ha despertado. Todos los sistemas están activos.', 45, true);

    console.log(chalk.bold.cyanBright('\n⚠️  ✧ ARQUITECTURA EMPRESARIAL LISTA ✧ ⚠️'));
    await animarTextoWinsi('「🚀🚀¡BOT HÍBRIDO SUPERIOR ACTIVADO!🚀🚀」', 80, true);

    console.log(chalk.greenBright('\n💎 Sistema WinsiBot V4.0 totalmente operativo.\n🔥 Esperando conexiones, jefe...\n'));

    await new Promise(res => setTimeout(res, 700));
    console.log(chalk.bold.gray('\n◆═══════════════════════════════════════════════◆'));
    await animarTextoWinsi('💎 Sistema creado por:', 40, false);
    await animarTextoWinsi('👑 ★ HEPEIN OFICIAL ★', 90, true);
    await animarTextoWinsi('📱 ★ +51 916360161 ★', 90, true);
    console.log(chalk.bold.gray('◆═══════════════════════════════════════════════◆\n'));
}

const frasesWinsi = [
    '\n🚀 WinsiBot V4.0 reiniciado. 💎 Cargando sistemas híbridos...\n',
    '\n✅ Reinicio completado. ⚡ WinsiBot V4.0 listo.\n',
    '\n💎 Sistema WinsiBot V4.0: 🔥 Online.\n',
    '\n🚀 WinsiBot renace con poder superior. ⭐\n',
    '\n⚡ Reboot: WinsiBot V4.0 Híbrido 🚀\n'
];

function fraseAleatoriaWinsi() {
    return frasesWinsi[Math.floor(Math.random() * frasesWinsi.length)];
}

const archivoArranque = './.winsibot-startup';

if (!fs.existsSync(archivoArranque)) {
    await iniciarWinsiBot();
    fs.writeFileSync(archivoArranque, 'WINSIBOT V4.0 INICIADO POR HEPEIN OFICIAL');
} else {
    console.log(chalk.greenBright(fraseAleatoriaWinsi()));
}

global.__filename = function filename(pathURL = import.meta.url, rmPrefix = platform !== 'win32') {
    return rmPrefix ? /file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL : pathToFileURL(pathURL).toString();
};

global.__dirname = function dirname(pathURL) {
    return path.dirname(global.__filename(pathURL, true));
};

global.__require = function require(dir = import.meta.url) {
    return createRequire(dir);
};

global.API = (name, path = '/', query = {}, apikeyqueryname) => 
    (name in global.APIs ? global.APIs[name] : name) + path + 
    (query || apikeyqueryname ? '?' + new URLSearchParams(Object.entries({
        ...query, 
        ...(apikeyqueryname ? {[apikeyqueryname]: global.APIKeys[name in global.APIs ? global.APIs[name] : name]} : {})
    })) : '');

global.timestamp = { start: new Date() };

const __dirname = global.__dirname(import.meta.url);

global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse());
global.prefix = new RegExp('^[#/!.]');

global.db = new Low(/https?:\/\//.test(global.opts['db'] || '') ? 
    new cloudDBAdapter(global.opts['db']) : 
    new JSONFile('./database.json')
);

global.DATABASE = global.db;

global.loadDatabase = async function loadDatabase() {
    if (global.db.READ) {
        return new Promise((resolve) => setInterval(async function() {
            if (!global.db.READ) {
                clearInterval(this);
                resolve(global.db.data == null ? global.loadDatabase() : global.db.data);
            }
        }, 1 * 1000));
    }
    if (global.db.data !== null) return;
    global.db.READ = true;
    await global.db.read().catch(console.error);
    global.db.READ = null;
    global.db.data = {
        users: {},
        chats: {},
        stats: {},
        msgs: {},
        sticker: {},
        settings: {},
        metadata: {
            bot: 'WinsiBot V4.0',
            version: '4.0.0',
            creator: 'Hepein Oficial',
            phone: '+51 916360161',
            created: Date.now(),
            lastUpdate: Date.now(),
            startCount: (global.db.data?.metadata?.startCount || 0) + 1
        },
        ...(global.db.data || {}),
    };
    global.db.chain = chain(global.db.data);
};

await loadDatabase();

global.chatgpt = new Low(new JSONFile(path.join(__dirname, '/db/chatgpt.json')));
global.loadChatgptDB = async function loadChatgptDB() {
    if (global.chatgpt.READ) {
        return new Promise((resolve) =>
            setInterval(async function() {
                if (!global.chatgpt.READ) {
                    clearInterval(this);
                    resolve(global.chatgpt.data === null ? global.loadChatgptDB() : global.chatgpt.data);
                }
            }, 1 * 1000)
        );
    }
    if (global.chatgpt.data !== null) return;
    global.chatgpt.READ = true;
    await global.chatgpt.read().catch(console.error);
    global.chatgpt.READ = null;
    global.chatgpt.data = {
        users: {},
        ...(global.chatgpt.data || {}),
    };
    global.chatgpt.chain = lodash.chain(global.chatgpt.data);
};

await loadChatgptDB();

global.authFile = global.sessions || 'session';
const { state, saveState, saveCreds } = await useMultiFileAuthState(global.authFile);
const msgRetryCounterMap = (MessageRetryMap) => { };
const msgRetryCounterCache = new NodeCache();
const { version } = await fetchLatestBaileysVersion();
let phoneNumber = global.botNumberCode;

const methodCodeQR = process.argv.includes("qr");
const methodCode = !!phoneNumber || process.argv.includes("code");
const MethodMobile = process.argv.includes("mobile");
const colores = chalk.bgMagenta.white;
const opcionQR = chalk.bold.green;
const opcionTexto = chalk.bold.cyan;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (texto) => new Promise((resolver) => rl.question(texto, resolver));

let opcion;
if (methodCodeQR) {
    opcion = '1';
}

if (!methodCodeQR && !methodCode && !fs.existsSync(`./${global.authFile}/creds.json`)) {
    do {
        opcion = await question(
            colores('🚀 WinsiBot V4.0 - Elija una opción:\n') + 
            opcionQR('1. Con código QR\n') + 
            opcionTexto('2. Con código de texto de 8 dígitos\n--> ')
        );

        if (!/^[1-2]$/.test(opcion)) {
            console.log(chalk.bold.redBright(`💎 Solo se permiten números 1 o 2.`));
        }
    } while (opcion !== '1' && opcion !== '2' || fs.existsSync(`./${global.authFile}/creds.json`));
}

const filterStrings = [
    "Q2xvc2luZyBzdGFsZSBvcGVu",
    "Q2xvc2luZyBvcGVuIHNlc3Npb24=", 
    "RmFpbGVkIHRvIGRlY3J5cHQ=",
    "U2Vzc2lvbiBlcnJvcg==",
    "RXJyb3I6IEJhZCBNQUM=",
    "RGVjcnlwdGVkIG1lc3NhZ2U="
];

console.info = () => {};
console.debug = () => {};
['log', 'warn', 'error'].forEach(methodName => redefineConsoleMethod(methodName, filterStrings));

const connectionOptions = {
    logger: pino({ level: 'silent' }),
    printQRInTerminal: opcion == '1' ? true : methodCodeQR ? true : false,
    mobile: MethodMobile, 
    browser: opcion == '1' ? 
        [`WinsiBot V4.0`, 'Chrome', '110.0.0'] : 
        methodCodeQR ? 
        [`WinsiBot V4.0`, 'Chrome', '110.0.0'] : 
        ['WinsiBot V4.0', 'Chrome', '110.0.0'],
    auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: "fatal" }).child({ level: "fatal" })),
    },
    markOnlineOnConnect: true, 
    generateHighQualityLinkPreview: true, 
    getMessage: async (clave) => {
        let jid = jidNormalizedUser(clave.remoteJid);
        let msg = store ? await store.loadMessage(jid, clave.id) : null;
        return msg?.message || "WinsiBot V4.0 by Hepein Oficial";
    },
    msgRetryCounterCache,
    msgRetryCounterMap,
    defaultQueryTimeoutMs: undefined,
    version,
};

global.conn = makeWASocket(connectionOptions);

if (!fs.existsSync(`./${global.authFile}/creds.json`)) {
    if (opcion === '2' || methodCode) {
        opcion = '2';
        if (!global.conn.authState.creds.registered) {
            let addNumber;
            if (!!phoneNumber) {
                addNumber = phoneNumber.replace(/[^0-9]/g, '');
            } else {
                do {
                    phoneNumber = await question(
                        chalk.bgBlack(chalk.bold.greenBright(`🚀 WinsiBot V4.0 - Ingrese el número de WhatsApp\n${chalk.bold.magentaBright('---> ')}`))
                    );
                    phoneNumber = phoneNumber.replace(/\D/g,'');
                    if (!phoneNumber.startsWith('+')) {
                        phoneNumber = `+${phoneNumber}`;
                    }
                } while (!await isValidPhoneNumber(phoneNumber));
                
                rl.close();
                addNumber = phoneNumber.replace(/\D/g, '');
                
                setTimeout(async () => {
                    let codeBot = await global.conn.requestPairingCode(addNumber);
                    codeBot = codeBot?.match(/.{1,4}/g)?.join("-") || codeBot;
                    console.log(
                        chalk.bold.white(chalk.bgMagenta(`🚀 WinsiBot V4.0 - Código:`)), 
                        chalk.bold.white(chalk.white(codeBot))
                    );
                }, 3000);
            }
        }
    }
}

global.conn.isInit = false;
global.conn.well = false;
global.conn.logger.info(`🚀 WinsiBot V4.0 by Hepein Oficial - Iniciando...\n`);

if (!global.opts['test']) {
    if (global.db) {
        setInterval(async () => {
            if (global.db.data) await global.db.write();
            if (global.chatgpt.data) await global.chatgpt.write();
        }, 30 * 1000);
    }
}

async function connectionUpdate(update) {
    const { connection, lastDisconnect, isNewLogin, qr } = update;
    const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;

    global.stopped = connection;

    if (isNewLogin) global.conn.isInit = true;

    if (!global.db.data) await loadDatabase();

    if ((qr && qr !== '0') || methodCodeQR) {
        if (opcion === '1' || methodCodeQR) {
            console.log(chalk.bold.yellow(`\n🚀 ESCANEA EL CÓDIGO QR - WINSIBOT V4.0 - EXPIRA EN 45 SEGUNDOS`));
        }
    }

    if (connection === 'open') {
        console.log(chalk.bold.green('\n🚀 WINSIBOT V4.0 CONECTADO EXITOSAMENTE 💎'));
        console.log(chalk.cyan('👑 Creado por: Hepein Oficial'));
        console.log(chalk.cyan('📱 WhatsApp: +51 916360161'));
        console.log(chalk.cyan('⚡ Versión: 4.0.0 - Bot Híbrido Superior'));
        
        try {
            await global.conn.sendMessage('51916360161@s.whatsapp.net', {
                text: `🚀 *WinsiBot V4.0 Conectado*\n\n` +
                      `✅ Estado: Operativo\n` +
                      `⏰ Hora: ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}\n` +
                      `💎 Versión: 4.0.0\n` +
                      `🔥 Inicios: ${global.db.data.metadata.startCount}\n\n` +
                      `*Bot híbrido superior by Hepein Oficial*`
            });
        } catch (error) {
            console.log(chalk.yellow('⚠️ No se pudo notificar al creador'));
        }
    }

    if (connection === 'close') {
        switch (reason) {
            case DisconnectReason.badSession:
            case DisconnectReason.loggedOut:
                console.log(chalk.bold.redBright(`\n⚠️ SESIÓN INVÁLIDA O CERRADA, BORRA LA CARPETA ${global.authFile} Y ESCANEA EL CÓDIGO QR ⚠️`));
                break;
            case DisconnectReason.connectionClosed:
                console.log(chalk.bold.magentaBright(`\n⚠️ CONEXIÓN CERRADA, REINICIANDO WINSIBOT...`));
                break;
            case DisconnectReason.connectionLost:
                console.log(chalk.bold.blueBright(`\n⚠️ CONEXIÓN PERDIDA, RECONECTANDO WINSIBOT...`));
                break;
            case DisconnectReason.connectionReplaced:
                console.log(chalk.bold.yellowBright(`\n⚠️ CONEXIÓN REEMPLAZADA, OTRA SESIÓN INICIADA`));
                return;
            case DisconnectReason.restartRequired:
                console.log(chalk.bold.cyanBright(`\n🔄 REINICIANDO WINSIBOT V4.0...`));
                break;
            case DisconnectReason.timedOut:
                console.log(chalk.bold.yellowBright(`\n⏰ TIEMPO AGOTADO, REINTENTANDO CONEXIÓN...`));
                break;
            default:
                console.log(chalk.bold.redBright(`\n❓ DESCONEXIÓN DESCONOCIDA (${reason || 'Desconocido'})`));
                break;
        }

        if (global.conn?.ws?.socket === null) {
            await global.reloadHandler(true).catch(console.error);
            global.timestamp.connect = new Date();
        }
    }
}

process.on('uncaughtException', console.error);

let isInit = true;
let handler = await import('./handler.js');

global.reloadHandler = async function(restatConn) {
    try {
        const Handler = await import(`./handler.js?update=${Date.now()}`).catch(console.error);
        if (Object.keys(Handler || {}).length) handler = Handler;
    } catch (e) {
        console.error('Error reloading handler:', e);
    }
    
    if (restatConn) {
        const oldChats = global.conn.chats;
        try {
            global.conn.ws.close();
        } catch { }
        global.conn.ev.removeAllListeners();
        global.conn = makeWASocket(connectionOptions, { chats: oldChats });
        isInit = true;
    }
    
    if (!isInit) {
        global.conn.ev.off('messages.upsert', global.conn.handler);
        global.conn.ev.off('connection.update', global.conn.connectionUpdate);
        global.conn.ev.off('creds.update', global.conn.credsUpdate);
    }

    global.conn.handler = handler.handler.bind(global.conn);
    global.conn.connectionUpdate = connectionUpdate.bind(global.conn);
    global.conn.credsUpdate = saveCreds.bind(global.conn, true);

    global.conn.ev.on('messages.upsert', global.conn.handler);
    global.conn.ev.on('connection.update', global.conn.connectionUpdate);
    global.conn.ev.on('creds.update', global.conn.credsUpdate);
    isInit = false;
    return true;
};


global.rutaJadiBot = join(__dirname, './WinsiBotJadi');

if (global.winsiBotJadibts || global.blackJadibts) {
    if (!existsSync(global.rutaJadiBot)) {
        mkdirSync(global.rutaJadiBot, { recursive: true });
        console.log(chalk.bold.cyan(`🚀 La carpeta: WinsiBotJadi se creó correctamente.`));
    } else {
        console.log(chalk.bold.cyan(`💎 La carpeta: WinsiBotJadi ya existe.`));
    }

    const readRutaJadiBot = readdirSync(global.rutaJadiBot);
    if (readRutaJadiBot.length > 0) {
        const creds = 'creds.json';
        for (const gjbts of readRutaJadiBot) {
            const botPath = join(global.rutaJadiBot, gjbts);
            const readBotPath = readdirSync(botPath);
            if (readBotPath.includes(creds)) {
                if (winsiBotJadiBot) {
                    winsiBotJadiBot({
                        pathWinsiBotJadiBot: botPath, 
                        m: null, 
                        conn: global.conn, 
                        args: '', 
                        usedPrefix: '/', 
                        command: 'serbot'
                    });
                }
            }
        }
    }
}

const pluginFolder = global.__dirname(join(__dirname, './plugins'));
const pluginFilter = (filename) => /\.js$/.test(filename);
global.plugins = {};

async function filesInit() {
    if (!existsSync(pluginFolder)) {
        mkdirSync(pluginFolder, { recursive: true });
        console.log(chalk.green('📁 Directorio plugins creado'));
        return;
    }
    
    for (const filename of readdirSync(pluginFolder).filter(pluginFilter)) {
        try {
            const file = global.__filename(join(pluginFolder, filename));
            const module = await import(file);
            global.plugins[filename] = module.default || module;
        } catch (e) {
            global.conn.logger.error(`Error loading plugin ${filename}:`, e);
            delete global.plugins[filename];
        }
    }
}

await filesInit().then((_) => {
    console.log(chalk.green(`📦 ${Object.keys(global.plugins).length} plugins cargados`));
}).catch(console.error);

global.reload = async (_ev, filename) => {
    if (pluginFilter(filename)) {
        const dir = global.__filename(join(pluginFolder, filename), true);
        if (filename in global.plugins) {
            if (existsSync(dir)) {
                global.conn.logger.info(` updated plugin - '${filename}'`);
            } else {
                global.conn.logger.warn(`deleted plugin - '${filename}'`);
                return delete global.plugins[filename];
            }
        } else {
            global.conn.logger.info(`new plugin - '${filename}'`);
        }
        
        const err = syntaxerror(readFileSync(dir), filename, {
            sourceType: 'module',
            allowAwaitOutsideFunction: true,
        });
        
        if (err) {
            global.conn.logger.error(`syntax error while loading '${filename}'\n${format(err)}`);
        } else {
            try {
                const module = (await import(`${global.__filename(dir)}?update=${Date.now()}`));
                global.plugins[filename] = module.default || module;
            } catch (e) {
                global.conn.logger.error(`error require plugin '${filename}\n${format(e)}'`);
            } finally {
                global.plugins = Object.fromEntries(Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b)));
            }
        }
    }
};

Object.freeze(global.reload);
watch(pluginFolder, global.reload);
await global.reloadHandler();

async function _quickTest() {
    const test = await Promise.all([
        spawn('ffmpeg'),
        spawn('ffprobe'),
        spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-filter_complex', 'color', '-frames:v', '1', '-f', 'webp', '-']),
        spawn('convert'),
        spawn('magick'),
        spawn('gm'),
        spawn('find', ['--version']),
    ].map((p) => {
        return Promise.race([
            new Promise((resolve) => {
                p.on('close', (code) => {
                    resolve(code !== 127);
                });
            }),
            new Promise((resolve) => {
                p.on('error', (_) => resolve(false));
            })
        ]);
    }));
    
    const [ffmpeg, ffprobe, ffmpegWebp, convert, magick, gm, find] = test;
    const s = global.support = { ffmpeg, ffprobe, ffmpegWebp, convert, magick, gm, find };
    Object.freeze(global.support);
}

function clearTmp() {
    try {
        const tmpDir = join(__dirname, 'tmp');
        if (!existsSync(tmpDir)) return;
        
        const filenames = readdirSync(tmpDir);
        filenames.forEach(file => {
            const filePath = join(tmpDir, file);
            const stats = statSync(filePath);
            if (stats.isFile() && (Date.now() - stats.mtimeMs >= 1000 * 60 * 3)) {
                unlinkSync(filePath);
            }
        });
    } catch (error) {
        console.log(chalk.yellow('⚠️ Error limpiando tmp'));
    }
}

function purgeSession() {
    try {
        let prekey = [];
        let directorio = readdirSync(`./${global.authFile}`);
        let filesFolderPreKeys = directorio.filter(file => file.startsWith('pre-key-'));
        prekey = [...prekey, ...filesFolderPreKeys];
        
        filesFolderPreKeys.forEach(files => {
            unlinkSync(`./${global.authFile}/${files}`);
        });
    } catch (error) {
        console.log(chalk.yellow('⚠️ Error purgando sesión'));
    }
}

function purgeSessionSB() {
    try {
        const rutaJadi = global.rutaJadiBot || './WinsiBotJadi';
        if (!existsSync(rutaJadi)) return;
        
        const listaDirectorios = readdirSync(rutaJadi);
        let SBprekey = [];
        
        listaDirectorios.forEach(directorio => {
            const dirPath = join(rutaJadi, directorio);
            if (statSync(dirPath).isDirectory()) {
                const DSBPreKeys = readdirSync(dirPath).filter(fileInDir => fileInDir.startsWith('pre-key-'));
                SBprekey = [...SBprekey, ...DSBPreKeys];
                DSBPreKeys.forEach(fileInDir => {
                    if (fileInDir !== 'creds.json') {
                        unlinkSync(join(dirPath, fileInDir));
                    }
                });
            }
        });
        
        if (SBprekey.length === 0) {
            console.log(chalk.bold.green(`\n╭» 💎 WinsiBotJadi 💎\n│→ NADA POR ELIMINAR \n╰― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ⌫ ♻️`));
        } else {
            console.log(chalk.bold.cyanBright(`\n╭» 🚀 WinsiBotJadi 🚀\n│→ ARCHIVOS NO ESENCIALES ELIMINADOS\n╰― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ⌫ ♻️`));
        }
    } catch (err) {
        console.log(chalk.bold.red(`\n╭» ❌ WinsiBotJadi ❌\n│→ OCURRIÓ UN ERROR\n╰― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ⌫ ♻️\n` + err));
    }
}

function redefineConsoleMethod(methodName, filterStrings) {
    const originalConsoleMethod = console[methodName];
    console[methodName] = function() {
        const message = arguments[0];
        if (typeof message === 'string' && filterStrings.some(filterString => message.includes(atob(filterString)))) {
            arguments[0] = "";
        }
        originalConsoleMethod.apply(console, arguments);
    };
}

setInterval(async () => {
    if (global.stopped === 'close' || !global.conn || !global.conn.user) return;
    await clearTmp();
    console.log(chalk.bold.cyanBright(`\n╭» 🗑️ MULTIMEDIA 🗑️\n│→ ARCHIVOS DE LA CARPETA TMP ELIMINADOS\n╰― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ⌫ ♻️`));
}, 1000 * 60 * 4);

setInterval(async () => {
    if (global.stopped === 'close' || !global.conn || !global.conn.user) return;
    await purgeSession();
    console.log(chalk.bold.cyanBright(`\n╭» 🔧 ${global.authFile} 🔧\n│→ SESIONES NO ESENCIALES ELIMINADAS\n╰― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ― ⌫ ♻️`));
}, 1000 * 60 * 10);

setInterval(async () => {
    if (global.stopped === 'close' || !global.conn || !global.conn.user) return;
    await purgeSessionSB();
}, 1000 * 60 * 10);


async function isValidPhoneNumber(number) {
    try {
        number = number.replace(/\s+/g, '');
        if (number.startsWith('+521')) {
            number = number.replace('+521', '+52');
        } else if (number.startsWith('+52') && number[4] === '1') {
            number = number.replace('+52 1', '+52');
        }
        const parsedNumber = phoneUtil.parseAndKeepRawInput(number);
        return phoneUtil.isValidNumber(parsedNumber);
    } catch (error) {
        return false;
    }
}

_quickTest().then(() => {
    global.conn.logger.info(chalk.bold(`🚀 WinsiBot V4.0 by Hepein Oficial - LISTO\n`.trim()));
    console.log(chalk.bold.green('\n💎 ==================================='));
    console.log(chalk.bold.cyan('   🚀 WINSIBOT V4.0 COMPLETAMENTE OPERATIVO'));
    console.log(chalk.bold.yellow('   👑 Creado por: Hepein Oficial'));
    console.log(chalk.bold.magenta('   📱 WhatsApp: +51 916360161'));
    console.log(chalk.bold.white('   ⚡ Bot Híbrido Superior Activado'));
    console.log(chalk.bold.green('💎 =================================\n'));
}).catch(console.error);*/


/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * │                        WinsiBot V4.0 - INDEX.TS COMPLETO                  │
 * │                           Creado por: Hepein Oficial                        │
 * │                          Contacto: +51 916360161                           │
 * │         Bot híbrido superior - TypeScript con arquitectura empresarial     │
 * ═══════════════════════════════════════════════════════════════════════════════
 */

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

// ═══════════════════════════════════════════════════════════════════════════════
// │                            IMPORTACIONES PRINCIPALES                       │
// ═══════════════════════════════════════════════════════════════════════════════

import './config.js';
import { setupMaster, fork } from 'cluster';
import { watchFile, unwatchFile } from 'fs';
import cfonts from 'cfonts';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { platform } from 'process';
import * as ws from 'ws';
import fs, { 
    readdirSync, statSync, unlinkSync, existsSync, mkdirSync, 
    readFileSync, rmSync, watch, writeFileSync 
} from 'fs';
import yargs from 'yargs';
import { spawn, exec } from 'child_process';
import lodash from 'lodash';
import chalk from 'chalk';
import syntaxerror from 'syntax-error';
import { tmpdir } from 'os';
import { format } from 'util';
import boxen from 'boxen';
import P from 'pino';
import pino from 'pino';
import Pino from 'pino';
import path, { join, dirname } from 'path';
import { Boom } from '@hapi/boom';
import { Low, JSONFile } from 'lowdb';
import readline, { createInterface } from 'readline';
import NodeCache from 'node-cache';
import pkg from 'google-libphonenumber';

// Baileys imports
import { 
    DisconnectReason, 
    useMultiFileAuthState, 
    MessageRetryMap, 
    fetchLatestBaileysVersion, 
    makeCacheableSignalKeyStore, 
    jidNormalizedUser,
    makeWASocket as makeWASocketCore,
    proto
} from '@whiskeysockets/baileys';

// Imports de lib
import { makeWASocket, protoType, serialize } from './lib/simple.js';
import { mongoDB, mongoDBV2 } from './lib/mongoDB.js';
import store from './lib/store.js';

// Configuración
const { PhoneNumberUtil } = pkg;
const phoneUtil = PhoneNumberUtil.getInstance();
const { CONNECTING } = ws;
const { chain } = lodash;
const { say } = cfonts;
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;

// ═══════════════════════════════════════════════════════════════════════════════
// │                            INTERFACES TYPESCRIPT                           │
// ═══════════════════════════════════════════════════════════════════════════════

interface WinsiBotConfig {
    creator: {
        name: string;
        phone: string;
        version: string;
        social: string;
    };
    bot: {
        name: string;
        prefix: string[];
        timezone: string;
        language: string;
        browser: string[];
    };
    termux: {
        MESSAGE_DELAY: number;
        COMMAND_COOLDOWN: number;
        MEMORY_CLEANUP_INTERVAL: number;
        DB_SAVE_INTERVAL: number;
    };
}

interface DatabaseStructure {
    users: Record<string, any>;
    chats: Record<string, any>;
    stats: Record<string, any>;
    msgs: Record<string, any>;
    sticker: Record<string, any>;
    settings: Record<string, any>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// │                            CONFIGURACIÓN DEL BOT                          │
// ═══════════════════════════════════════════════════════════════════════════════

const WINSIBOT_CONFIG: WinsiBotConfig = {
    creator: {
        name: 'Hepein Oficial',
        phone: '+51 916360161',
        version: '4.0.0',
        social: '@HepeinOficial'
    },
    bot: {
        name: 'WinsiBot V4.0',
        prefix: ['.', '#', '/', '!', '*'],
        timezone: 'America/Lima',
        language: 'es',
        browser: ['WinsiBot V4.0', 'Chrome', '110.0.0']
    },
    termux: {
        MESSAGE_DELAY: 1500,
        COMMAND_COOLDOWN: 2500,
        MEMORY_CLEANUP_INTERVAL: 300000,
        DB_SAVE_INTERVAL: 30000
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// │                            ANIMACIONES PERSONALIZADAS                     │
// ═══════════════════════════════════════════════════════════════════════════════

async function animateTextWinsi(texto: string, delay: number = 65, glitch: boolean = true): Promise<void> {
    const efectos = '░▒▓█▌▐|/<>~*⚡☠☢⌬🔥💎';
    let resultado = '';
    
    for (let i = 0; i < texto.length; i++) {
        resultado += texto[i];
        let linea = resultado;
        
        if (glitch) {
            const ruido = efectos[Math.floor(Math.random() * efectos.length)];
            linea += chalk.gray(ruido.repeat(Math.floor(Math.random() * 2)));
        }
        
        process.stdout.write('\r' + chalk.magentaBright(linea));
        await new Promise(res => setTimeout(res, delay));
    }
    console.log();
}

async function barraCargaWinsi(): Promise<void> {
    const frames = [
        '[⏳] Iniciando WinsiBot V4.0...',
        '[🔮] Cargando núcleo híbrido...',
        '[💾] Compilando sistemas TypeScript...',
        '[⚡] Conectando con Baileys...',
        '[🔥] Optimizando para Termux...',
        '[🌌] Activando funciones avanzadas...',
        '[💎] Configurando sistema de subbots...',
        '[✅] WinsiBot V4.0 OPERATIVO.'
    ];
    
    for (const frame of frames) {
        process.stdout.write('\r' + chalk.cyanBright(frame));
        await new Promise(res => setTimeout(res, 400));
    }
    console.log();
}

async function animacionWinsiBot(): Promise<void> {
    const frames = [
        `     🤖
    ╭───╮
   ( 💎_💎 )   ACTIVANDO WINSIBOT
   /|██|\\
    ███
   /   \\`,
        `     🤖
    ╭───╮
   ( ⚡_⚡ )   CONECTANDO SISTEMAS
   /|▓▓|\\
    ███
   /   \\`,
        `     🤖
    ╭───╮
   ( 🧠_🧠 )   CARGANDO IA AVANZADA
   /|░░|\\
    ███
   /   \\`
    ];
    
    for (let i = 0; i < 4; i++) {
        console.clear();
        console.log(chalk.greenBright(frames[i % frames.length]));
        await new Promise(res => setTimeout(res, 400));
    }
}

async function iniciarWinsiBot(): Promise<void> {
    console.clear();
    console.log(chalk.bold.cyanBright('\n⟦ 💎 ACCESO CONCEDIDO | WinsiBot V4.0 ⟧'));
    console.log(chalk.gray('💎 Iniciando sistema híbrido superior...'));
    await new Promise(res => setTimeout(res, 600));

    await animateTextWinsi('💎 Cargando arquitectura empresarial...', 50, true);
    await new Promise(res => setTimeout(res, 400));

    await barraCargaWinsi();
    await new Promise(res => setTimeout(res, 500));

    console.log(chalk.cyanBright('\n☰✦☰═☰  W I N S I B O T  ☰═☰✦☰'));
    await animateTextWinsi('⚔ Bienvenido al bot híbrido superior...', 60, true);
    console.log(chalk.cyanBright('☰✦☰════════════════════☰✦☰'));

    await new Promise(res => setTimeout(res, 300));
    await animateTextWinsi(`🧠 Desarrollado por: ${WINSIBOT_CONFIG.creator.name}`, 45, false);
    await new Promise(res => setTimeout(res, 600));

    console.log(chalk.yellowBright('\n⟦ 💎 INICIANDO INTERFAZ AVANZADA ⟧'));
    await animacionWinsiBot();

    await animateTextWinsi('\n💎 WinsiBot ha despertado. Todas las funciones están disponibles.', 40, true);

    console.log(chalk.bold.blueBright('\n⚠️  ✧ SISTEMA HÍBRIDO LISTO PARA ACTIVARSE ✧ ⚠️'));
    await animateTextWinsi('「💎💎¡ARQUITECTURA SUPERIOR ACTIVADA!💎💎」', 75, true);

    console.log(chalk.greenBright('\n💎 Sistema WinsiBot totalmente operativo.\n💎 Esperando comandos...\n'));

    await new Promise(res => setTimeout(res, 600));
    console.log(chalk.bold.gray('\n💎═════════════════════════════════════════💎'));
    await animateTextWinsi('💎 Bot creado por:', 40, false);
    await animateTextWinsi(`💎 ★ ${WINSIBOT_CONFIG.creator.name} ★`, 80, true);
    await animateTextWinsi(`💎 WhatsApp: ${WINSIBOT_CONFIG.creator.phone}`, 60, false);
    console.log(chalk.bold.gray('💎═════════════════════════════════════════💎\n'));
}

const frasesWinsi = [
    '\n💎 WinsiBot reiniciado. ⚙️ Cargando sistemas...\n',
    '\n💎 Reinicio completado. ⚡ WinsiBot listo.\n',
    '\n💎 Sistema WinsiBot: ⚙️ Online.\n',
    '\n💎 WinsiBot revive con poder superior. 🔥\n',
    '\n💎 Reboot: WinsiBot V4.0 ⚔️\n'
];

function fraseAleatoriaWinsi(): string {
    return frasesWinsi[Math.floor(Math.random() * frasesWinsi.length)];
}

// ═══════════════════════════════════════════════════════════════════════════════
// │                            CONFIGURACIÓN GLOBAL                           │
// ═══════════════════════════════════════════════════════════════════════════════

const archivoArranque = './.winsibot-startup';

if (!fs.existsSync(archivoArranque)) {
    await iniciarWinsiBot();
    fs.writeFileSync(archivoArranque, 'WINSIBOT STARTUP COMPLETED');
} else {
    console.log(chalk.greenBright(fraseAleatoriaWinsi()));
}

// Inicializar prototipos
protoType();
serialize();

// Configuración global mejorada
global.__filename = function filename(pathURL: string = import.meta.url, rmPrefix: boolean = platform !== 'win32'): string {
    return rmPrefix ? /file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL : pathToFileURL(pathURL).toString();
};

global.__dirname = function dirname(pathURL: string): string {
    return path.dirname(global.__filename(pathURL, true));
};

global.__require = function require(dir: string = import.meta.url) {
    return createRequire(dir);
};

global.API = (name: string, path: string = '/', query: any = {}, apikeyqueryname?: string): string => 
    (name in global.APIs ? global.APIs[name] : name) + path + 
    (query || apikeyqueryname ? '?' + new URLSearchParams(Object.entries({
        ...query, 
        ...(apikeyqueryname ? {[apikeyqueryname]: global.APIKeys[name in global.APIs ? global.APIs[name] : name]} : {})
    })) : '');

global.timestamp = { start: new Date() };

const __dirname = global.__dirname(import.meta.url);

global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse());
global.prefix = new RegExp('^[#/!.*]');

// ═══════════════════════════════════════════════════════════════════════════════
// │                            CONFIGURACIÓN DE BASE DE DATOS                 │
// ═══════════════════════════════════════════════════════════════════════════════

global.db = new Low(/https?:\/\//.test(global.opts['db'] || '') ? 
    new (await import('./lib/cloudDBAdapter.js')).default(global.opts['db']) : 
    new JSONFile('./database.json')
);

global.DATABASE = global.db;

global.loadDatabase = async function loadDatabase(): Promise<any> {
    if (global.db.READ) {
        return new Promise((resolve) => setInterval(async function(this: NodeJS.Timeout) {
            if (!global.db.READ) {
                clearInterval(this);
                resolve(global.db.data == null ? global.loadDatabase() : global.db.data);
            }
        }, 1 * 1000));
    }
    if (global.db.data !== null) return;
    global.db.READ = true;
    await global.db.read().catch(console.error);
    global.db.READ = null;
    global.db.data = {
        users: {},
        chats: {},
        stats: {},
        msgs: {},
        sticker: {},
        settings: {},
        ...(global.db.data || {}),
    };
    global.db.chain = chain(global.db.data);
};

await global.loadDatabase();

// ═══════════════════════════════════════════════════════════════════════════════
// │                            CONFIGURACIÓN DE CONEXIÓN                      │
// ═══════════════════════════════════════════════════════════════════════════════

const { state, saveState, saveCreds } = await useMultiFileAuthState(global.sessions || './session');
const msgRetryCounterMap = (MessageRetryMap) => { };
const msgRetryCounterCache = new NodeCache();
const { version } = await fetchLatestBaileysVersion();
let phoneNumber: string = global.botNumber;

const methodCodeQR: boolean = process.argv.includes("qr");
const methodCode: boolean = !!phoneNumber || process.argv.includes("code");
const MethodMobile: boolean = process.argv.includes("mobile");
const colores = chalk.bgMagenta.white;
const opcionQR = chalk.bold.green;
const opcionTexto = chalk.bold.cyan;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (texto: string): Promise<string> => new Promise((resolver) => rl.question(texto, resolver));

let opcion: string;
if (methodCodeQR) {
    opcion = '1';
}

if (!methodCodeQR && !methodCode && !fs.existsSync(`./${global.sessions || 'session'}/creds.json`)) {
    do {
        opcion = await question(
            colores('💎 Elija una opción:\n') + 
            opcionQR('1. Con código QR\n') + 
            opcionTexto('2. Con código de texto de 8 dígitos\n--> ')
        );

        if (!/^[1-2]$/.test(opcion)) {
            console.log(chalk.bold.redBright(`💎 Por favor, seleccione solo 1 o 2.`));
        }
    } while (opcion !== '1' && opcion !== '2' || fs.existsSync(`./${global.sessions || 'session'}/creds.json`));
}

// Filtrar mensajes de console
console.info = () => {};
console.debug = () => {};

const connectionOptions = {
    logger: pino({ level: 'silent' }),
    printQRInTerminal: opcion == '1' ? true : methodCodeQR ? true : false,
    mobile: MethodMobile,
    browser: opcion == '1' ? 
        WINSIBOT_CONFIG.bot.browser : 
        methodCodeQR ? 
        WINSIBOT_CONFIG.bot.browser : 
        ['Ubuntu', 'Chrome', '110.0.0'],
    auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: "fatal" }).child({ level: "fatal" })),
    },
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    getMessage: async (clave: any) => {
        const jid = jidNormalizedUser(clave.remoteJid);
        const msg = await store?.loadMessage(jid, clave.id);
        return msg?.message || "";
    },
    msgRetryCounterCache,
    msgRetryCounterMap,
    defaultQueryTimeoutMs: undefined,
    version,
};

global.conn = makeWASocket(connectionOptions);

// ═══════════════════════════════════════════════════════════════════════════════
// │                            MANEJO DE CÓDIGO DE EMPAREJAMIENTO             │
// ═══════════════════════════════════════════════════════════════════════════════

if (!fs.existsSync(`./${global.sessions || 'session'}/creds.json`)) {
    if (opcion === '2' || methodCode) {
        opcion = '2';
        if (!global.conn.authState.creds.registered) {
            let addNumber: string;
            if (!!phoneNumber) {
                addNumber = phoneNumber.replace(/[^0-9]/g, '');
            } else {
                do {
                    phoneNumber = await question(
                        chalk.bgBlack(chalk.bold.greenBright(`💎 Por favor, ingrese el número de WhatsApp.\n${chalk.bold.magentaBright('---> ')}`))
                    );
                    phoneNumber = phoneNumber.replace(/\D/g, '');
                    if (!phoneNumber.startsWith('+')) {
                        phoneNumber = `+${phoneNumber}`;
                    }
                } while (!await isValidPhoneNumber(phoneNumber));
                
                rl.close();
                addNumber = phoneNumber.replace(/\D/g, '');
                
                setTimeout(async () => {
                    let codeBot = await global.conn.requestPairingCode(addNumber);
                    codeBot = codeBot?.match(/.{1,4}/g)?.join("-") || codeBot;
                    console.log(
                        chalk.bold.white(chalk.bgMagenta(`💎 Código de WinsiBot:`)), 
                        chalk.bold.white(chalk.white(codeBot))
                    );
                }, 3000);
            }
        }
    }
}

global.conn.isInit = false;
global.conn.well = false;
global.conn.logger.info(`💎 W I N S I B O T  I N I C I A D O\n`);

// ═══════════════════════════════════════════════════════════════════════════════
// │                            AUTO-GUARDADO Y LIMPIEZA                       │
// ═══════════════════════════════════════════════════════════════════════════════

if (!global.opts['test']) {
    if (global.db) {
        setInterval(async () => {
            if (global.db.data) await global.db.write();
            if (global.opts['autocleartmp'] && (global.support || {}).find) {
                const tmp = [tmpdir(), 'tmp', `${global.jadi || 'jadibot'}`];
                tmp.forEach((filename) => spawn('find', [filename, '-amin', '3', '-type', 'f', '-delete']));
            }
        }, WINSIBOT_CONFIG.termux.DB_SAVE_INTERVAL);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// │                            MANEJO DE ACTUALIZACIONES DE CONEXIÓN          │
// ═══════════════════════════════════════════════════════════════════════════════

async function connectionUpdate(update: any): Promise<void> {
    const { connection, lastDisconnect, isNewLogin, qr } = update;
    const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;

    global.stopped = connection;

    if (isNewLogin) global.conn.isInit = true;

    if (!global.db.data) await global.loadDatabase();

    if ((qr && qr !== '0') || methodCodeQR) {
        if (opcion === '1' || methodCodeQR) {
            console.log(chalk.bold.yellow(`\n💎 ESCANEA EL CÓDIGO QR - EXPIRA EN 45 SEGUNDOS`));
        }
    }

    if (connection === 'open') {
        console.log(chalk.bold.green(`\n🎉 ${WINSIBOT_CONFIG.bot.name} CONECTADO ✅`));
        console.log(chalk.cyan(`👑 Creado por: ${WINSIBOT_CONFIG.creator.name}`));
        console.log(chalk.cyan(`📱 WhatsApp: ${WINSIBOT_CONFIG.creator.phone}`));
    }

    if (connection === 'close') {
        switch (reason) {
            case DisconnectReason.badSession:
            case DisconnectReason.loggedOut:
                console.log(chalk.bold.redBright(`\n⚠︎ SESIÓN INVÁLIDA O CERRADA, BORRA LA CARPETA ${global.sessions || 'session'} Y ESCANEA EL CÓDIGO QR ⚠︎`));
                break;

            case DisconnectReason.connectionClosed:
                console.log(chalk.bold.magentaBright(`\n⚠︎ CONEXIÓN CERRADA, REINICIANDO...`));
                await global.reloadHandler(true).catch(console.error);
                break;

            case DisconnectReason.connectionLost:
                console.log(chalk.bold.blueBright(`\n⚠︎ CONEXIÓN PERDIDA, RECONECTANDO...`));
                await global.reloadHandler(true).catch(console.error);
                break;

            case DisconnectReason.connectionReplaced:
                console.log(chalk.bold.yellowBright(`\n⚠︎ CONEXIÓN REEMPLAZADA, OTRA SESIÓN INICIADA`));
                return;

            case DisconnectReason.restartRequired:
                console.log(chalk.bold.cyanBright(`\n☑ REINICIANDO SESIÓN...`));
                await global.reloadHandler(true).catch(console.error);
                break;

            case DisconnectReason.timedOut:
                console.log(chalk.bold.yellowBright(`\n⚠︎ TIEMPO AGOTADO, REINTENTANDO CONEXIÓN...`));
                await global.reloadHandler(true).catch(console.error);
                break;

            default:
                console.log(chalk.bold.redBright(`\n⚠︎ DESCONEXIÓN DESCONOCIDA (${reason || 'Desconocido'})`));
                await global.reloadHandler(true).catch(console.error);
                break;
        }

        // Si el websocket está cerrado, intenta reconectar
        if (global.conn?.ws?.socket === null) {
            await global.reloadHandler(true).catch(console.error);
            global.timestamp.connect = new Date();
        }
    }
}

process.on('uncaughtException', console.error);

// ═══════════════════════════════════════════════════════════════════════════════
// │                            SISTEMA DE RECARGA DE HANDLER                  │
// ═══════════════════════════════════════════════════════════════════════════════

let isInit: boolean = true;
let handler = await import('./handler.js');

global.reloadHandler = async function(restatConn?: boolean): Promise<boolean> {
    try {
        const Handler = await import(`./handler.js?update=${Date.now()}`).catch(console.error);
        if (Object.keys(Handler || {}).length) handler = Handler;
    } catch (e) {
        console.error(e);
    }
    
    if (restatConn) {
        const oldChats = global.conn.chats;
        try {
            global.conn.ws.close();
        } catch { }
        global.conn.ev.removeAllListeners();
        global.conn = makeWASocket(connectionOptions, { chats: oldChats });
        isInit = true;
    }
    
    if (!isInit) {
        global.conn.ev.off('messages.upsert', global.conn.handler);
        global.conn.ev.off('connection.update', global.conn.connectionUpdate);
        global.conn.ev.off('creds.update', global.conn.credsUpdate);
    }

    global.conn.handler = handler.handler.bind(global.conn);
    global.conn.connectionUpdate = connectionUpdate.bind(global.conn);
    global.conn.credsUpdate = saveCreds.bind(global.conn, true);

    global.conn.ev.on('messages.upsert', global.conn.handler);
    global.conn.ev.on('connection.update', global.conn.connectionUpdate);
    global.conn.ev.on('creds.update', global.conn.credsUpdate);
    
    isInit = false;
    return true;
};

// ═══════════════════════════════════════════════════════════════════════════════
// │                            SISTEMA DE SUBBOTS                             │
// ═══════════════════════════════════════════════════════════════════════════════

// Configuración para subbots
global.conns = global.conns || [];
global.rutaJadiBot = join(__dirname, './subbots');

if (global.jadibotmd !== false) {
    if (!existsSync(global.rutaJadiBot)) {
        mkdirSync(global.rutaJadiBot, { recursive: true });
        console.log(chalk.bold.cyan(`💎 Carpeta de subbots creada: ${global.rutaJadiBot}`));
    } else {
        console.log(chalk.bold.cyan(`💎 Carpeta de subbots ya existe: ${global.rutaJadiBot}`));
    }

    // Cargar subbots existentes
    const readRutaJadiBot = readdirSync(global.rutaJadiBot);
    if (readRutaJadiBot.length > 0) {
        const creds = 'creds.json';
        for (const gjbts of readRutaJadiBot) {
            const botPath = join(global.rutaJadiBot, gjbts);
            if (existsSync(botPath) && statSync(botPath).isDirectory()) {
                const readBotPath = readdirSync(botPath);
                if (readBotPath.includes(creds)) {
                    console.log(chalk.green(`💎 SubBot encontrado: ${gjbts}`));
                    // El sistema de jadibot se manejará desde el plugin
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// │                            SISTEMA DE PLUGINS                             │
// ═══════════════════════════════════════════════════════════════════════════════

const pluginFolder = global.__dirname(join(__dirname, './plugins'));
const pluginFilter = (filename: string): boolean => /\.js$/.test(filename);
global.plugins = {};

async function filesInit(): Promise<void> {
    if (!existsSync(pluginFolder)) {
        mkdirSync(pluginFolder, { recursive: true });
        console.log(chalk.blue('💎 Directorio plugins creado'));
        return;
    }

    for (const filename of readdirSync(pluginFolder).filter(pluginFilter)) {
        try {
            const file = global.__filename(join(pluginFolder, filename));
            const module = await import(file);
            global.plugins[filename] = module.default || module;
            console.log(chalk.green(`✓ Plugin cargado: ${filename}`));
        } catch (e) {
            global.conn?.logger.error(e);
            delete global.plugins[filename];
            console.log(chalk.red(`✗ Error cargando plugin: ${filename}`));
        }
    }
}

filesInit().then((_) => Object.keys(global.plugins)).catch(console.error);

// Sistema de recarga de plugins
global.reload = async (_ev: any, filename: string): Promise<void> => {
    if (pluginFilter(filename)) {
        const dir = global.__filename(join(pluginFolder, filename), true);
        if (filename in global.plugins) {
            if (existsSync(dir)) {
                global.conn.logger.info(` updated plugin - '${filename}'`);
            } else {
                global.conn.logger.warn(`deleted plugin - '${filename}'`);
                return delete global.plugins[filename];
            }
        } else {
            global.conn.logger.info(`new plugin - '${filename}'`);
        }
        
        const err = syntaxerror(readFileSync(dir), filename, {
            sourceType: 'module',
            allowAwaitOutsideFunction: true,
        });
        
        if (err) {
            global.conn.logger.error(`syntax error while loading '${filename}'\n${format(err)}`);
        } else {
            try {
                const module = await import(`${global.__filename(dir)}?update=${Date.now()}`);
                global.plugins[filename] = module.default || module;
            } catch (e) {
                global.conn.logger.error(`error require plugin '${filename}\n${format(e)}'`);
            } finally {
                global.plugins = Object.fromEntries(
                    Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b))
                );
            }
        }
    }
};

Object.freeze(global.reload);
watch(pluginFolder, global.reload);
await global.reloadHandler();

// ═══════════════════════════════════════════════════════════════════════════════
// │                            PRUEBA DE HERRAMIENTAS                         │
// ═══════════════════════════════════════════════════════════════════════════════

async function _quickTest(): Promise<void> {
    const test = await Promise.all([
        spawn('ffmpeg'),
        spawn('ffprobe'),
        spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-filter_complex', 'color', '-frames:v', '1', '-f', 'webp', '-']),
        spawn('convert'),
        spawn('magick'),
        spawn('gm'),
        spawn('find', ['--version']),
    ].map((p) => {
        return Promise.race([
            new Promise((resolve) => {
                p.on('close', (code) => {
                    resolve(code !== 127);
                });
            }),
            new Promise((resolve) => {
                p.on('error', (_) => resolve(false));
            })
        ]);
    }));
    
    const [ffmpeg, ffprobe, ffmpegWebp, convert, magick, gm, find] = test;
    const s = global.support = { ffmpeg, ffprobe, ffmpegWebp, convert, magick, gm, find };
    Object.freeze(global.support);
}

// ═══════════════════════════════════════════════════════════════════════════════
// │                            FUNCIONES DE LIMPIEZA                          │
// ═══════════════════════════════════════════════════════════════════════════════

function clearTmp(): void {
    try {
        const tmpDir = join(__dirname, 'tmp');
        if (!existsSync(tmpDir)) return;
        
        const filenames = readdirSync(tmpDir);
        filenames.forEach(file => {
            const filePath = join(tmpDir, file);
            if (existsSync(filePath)) {
                unlinkSync(filePath);
            }
        });
    } catch (error) {
        console.log(chalk.yellow('⚠️ Error limpiando archivos temporales'));
    }
}

function purgeSession(): void {
    try {
        const sessionDir = `./${global.sessions || 'session'}`;
        if (!existsSync(sessionDir)) return;
        
        let prekey: string[] = [];
        const directorio = readdirSync(sessionDir);
        const filesFolderPreKeys = directorio.filter(file => file.startsWith('pre-key-'));
        prekey = [...prekey, ...filesFolderPreKeys];
        
        filesFolderPreKeys.forEach(files => {
            unlinkSync(`${sessionDir}/${files}`);
        });
    } catch (error) {
        console.log(chalk.yellow('⚠️ Error purgando sesión'));
    }
}

function purgeSessionSB(): void {
    try {
        const jadiBotDir = `./${global.jadi || 'jadibot'}/`;
        if (!existsSync(jadiBotDir)) return;
        
        const listaDirectorios = readdirSync(jadiBotDir);
        let SBprekey: string[] = [];
        
        listaDirectorios.forEach(directorio => {
            const dirPath = `${jadiBotDir}${directorio}`;
            if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
                const DSBPreKeys = readdirSync(dirPath).filter(fileInDir => {
                    return fileInDir.startsWith('pre-key-');
                });
                SBprekey = [...SBprekey, ...DSBPreKeys];
                DSBPreKeys.forEach(fileInDir => {
                    if (fileInDir !== 'creds.json') {
                        unlinkSync(`${dirPath}/${fileInDir}`);
                    }
                });
            }
        });
        
        if (SBprekey.length === 0) {
            console.log(chalk.bold.green(`\n💎 SubBots: Nada por eliminar`));
        } else {
            console.log(chalk.bold.cyanBright(`\n💎 SubBots: Archivos no esenciales eliminados`));
        }
    } catch (err) {
        console.log(chalk.bold.red(`\n💎 Error en limpieza de SubBots: ${err}`));
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// │                            INTERVALOS DE LIMPIEZA                         │
// ═══════════════════════════════════════════════════════════════════════════════

setInterval(async () => {
    if (global.stopped === 'close' || !global.conn || !global.conn.user) return;
    await clearTmp();
    console.log(chalk.bold.cyanBright(`\n💎 Archivos temporales eliminados`));
}, 1000 * 60 * 4); // 4 minutos

setInterval(async () => {
    if (global.stopped === 'close' || !global.conn || !global.conn.user) return;
    await purgeSession();
    console.log(chalk.bold.cyanBright(`\n💎 Sesiones no esenciales eliminadas`));
}, 1000 * 60 * 10); // 10 minutos

setInterval(async () => {
    if (global.stopped === 'close' || !global.conn || !global.conn.user) return;
    await purgeSessionSB();
}, 1000 * 60 * 10); // 10 minutos

// ═══════════════════════════════════════════════════════════════════════════════
// │                            FUNCIÓN DE VALIDACIÓN                          │
// ═══════════════════════════════════════════════════════════════════════════════

async function isValidPhoneNumber(number: string): Promise<boolean> {
    try {
        number = number.replace(/\s+/g, '');
        if (number.startsWith('+521')) {
            number = number.replace('+521', '+52');
        } else if (number.startsWith('+52') && number[4] === '1') {
            number = number.replace('+52 1', '+52');
        }
        const parsedNumber = phoneUtil.parseAndKeepRawInput(number);
        return phoneUtil.isValidNumber(parsedNumber);
    } catch (error) {
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// │                            FINALIZACIÓN                                   │
// ═══════════════════════════════════════════════════════════════════════════════

_quickTest()
    .then(() => global.conn.logger.info(chalk.bold(`💎 WinsiBot V4.0 - Sistema completo activado\n`.trim())))
    .catch(console.error);

console.log(chalk.bold.green(`\n🎯 ${WINSIBOT_CONFIG.bot.name} iniciado correctamente`));
console.log(chalk.cyan(`👑 Creado por: ${WINSIBOT_CONFIG.creator.name}`));
console.log(chalk.cyan(`📱 WhatsApp: ${WINSIBOT_CONFIG.creator.phone}`));
console.log(chalk.cyan(`🚀 Versión: ${WINSIBOT_CONFIG.creator.version}`));
console.log(chalk.yellow(`\n💎 Bot híbrido superior con arquitectura TypeScript empresarial`));
