import os from 'os';
import { prisma } from '../db';
import { config } from '../config';
import { isEncryptionEnabled } from '../encrypt';

// ─── ANSI ─────────────────────────────────────────────────────────────
const R = '\x1b[0m';
const B = '\x1b[1m';
const D = '\x1b[2m';
const GR = '\x1b[90m';
const W = '\x1b[97m';
const CY = '\x1b[96m';
const GN = '\x1b[92m';
const YL = '\x1b[93m';
const RD = '\x1b[91m';
const BG_GN = '\x1b[42m';
const BG_CY = '\x1b[46m';
const BG_YL = '\x1b[43m';
const BG_RD = '\x1b[41m';
const BL = '\x1b[30m';

// ─── Helpers ──────────────────────────────────────────────────────────
function strip(s: string): string { return s.replace(/\x1b\[[0-9;]*m/g, ''); }
function rep(ch: string, n: number): string { return ch.repeat(Math.max(0, n)); }
function center(s: string, w: number): string {
  const v = strip(s);
  return ' '.repeat(Math.max(0, Math.floor((w - v.length) / 2))) + s;
}

function boxTop(iw: number): string { return `╭${rep('─', iw)}╮`; }
function boxBot(iw: number): string { return `╰${rep('─', iw)}╯`; }
function boxRow(content: string, iw: number): string {
  const vis = strip(content).length;
  return `│${content}${' '.repeat(Math.max(0, iw - vis))}│`;
}

function dot(ok: boolean): string { return ok ? `${GN}●${R}` : `${RD}●${R}`; }

// ─── Logo ─────────────────────────────────────────────────────────────
const LOGO = [
  `${B}${CY}███╗   ██╗${R}`,
  `${B}${CY}████╗  ██║${R}`,
  `${B}${CY}██╔██╗ ██║${R}`,
  `${B}${CY}██║╚██╗██║${R}`,
  `${B}${CY}██║ ╚████║${R}`,
  `${B}${CY}╚═╝  ╚═══╝${R}`,
];

// ─── Event Log ────────────────────────────────────────────────────────
interface LogEntry { t: string; l: 'info'|'warn'|'error'|'ok'; m: string; }
const logBuf: LogEntry[] = [];
const MAX_LOG = 6;

function addLog(level: LogEntry['l'], msg: string) {
  const now = new Date();
  const t = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  logBuf.push({ t, l: level, m: msg });
  if (logBuf.length > MAX_LOG) logBuf.shift();
}

function badge(level: string): string {
  const m: Record<string, string> = {
    info:  `${BG_CY}${BL}${B} INFO ${R}`,
    warn:  `${BG_YL}${BL}${B} WARN ${R}`,
    error: `${BG_RD}${W}${B} ERR  ${R}`,
    ok:    `${BG_GN}${BL}${B}  OK  ${R}`,
  };
  return m[level] || m.info;
}

// ─── Stats ────────────────────────────────────────────────────────────
let st = { u: 0, o: 0, ch: 0, m: 0, cn: 0 };

async function refreshStats() {
  try {
    const [u, o, ch, m, cn] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isOnline: true } }),
      prisma.chat.count(),
      prisma.message.count(),
      prisma.chat.count({ where: { type: 'channel' } }),
    ]);
    st = { u, o, ch, m, cn };
  } catch {}
}

function fmtUp(): string {
  const s = process.uptime();
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${Math.floor(s % 60)}s`;
}
function fmtMem(): string {
  const u = process.memoryUsage();
  return `${(u.heapUsed / 1048576).toFixed(1)}/${(u.heapTotal / 1048576).toFixed(1)} MB`;
}

// ─── Render ───────────────────────────────────────────────────────────
let lastOut = '';
let busy = false;

async function render() {
  if (busy) return;
  busy = true;
  await refreshStats();

  const TW = Math.min(process.stdout.columns || 80, 100);
  const IW = TW - 2;
  const L: string[] = [];
  const sep = `${GR}${rep('═', TW)}${R}`;

  // Header
  L.push(sep);
  for (const line of LOGO) L.push(center(line, TW));
  L.push(center(`${D}${GR}Secure Messenger Platform${R}`, TW));
  L.push(center(`${D}${GR}v1.0.0${R}`, TW));
  L.push('');
  L.push(sep);

  // Server
  L.push(`  ${B}${W}⚡ SERVER${R}`);
  L.push(boxTop(IW));
  L.push(boxRow(`  ${CY}Port${R}        ${config.port}`, IW));
  L.push(boxRow(`  ${CY}Local${R}       http://localhost:${config.port}`, IW));
  L.push(boxRow(`  ${CY}Network${R}     http://<your-ip>:${config.port}`, IW));
  L.push(boxRow(`  ${CY}Mode${R}        ${config.isProduction ? 'production' : 'development'}`, IW));
  L.push(boxRow(`  ${CY}PID${R}         ${process.pid}`, IW));
  L.push(boxBot(IW));
  L.push('');

  // Security
  const sec: [string, boolean][] = [
    ['JWT Secret',     !!config.jwtSecret],
    ['Encryption',      isEncryptionEnabled()],
    ['Min Password',    true],
    ['Session Timeout', true],
    ['Rate Limiting',   true],
    ['YooKassa Hook',  !!config.yukassaWebhookSecret],
  ];
  L.push(`  ${B}${W}🛡  SECURITY${R}`);
  L.push(boxTop(IW));
  for (const [label, ok] of sec) {
    L.push(boxRow(`  ${dot(ok)} ${W}${label}${R}  ${ok ? `${GN}ON${R}` : `${RD}OFF${R}`}`, IW));
  }
  L.push(boxBot(IW));
  L.push('');

  // Database
  L.push(`  ${B}${W}💾 DATABASE${R}`);
  L.push(boxTop(IW));
  L.push(boxRow(`  ${dot(true)} ${W}PostgreSQL${R}  ${GN}ON${R}`, IW));
  L.push(boxRow(`  ${dot(true)} ${W}Prisma ORM${R}  ${GN}ON${R}`, IW));
  L.push(boxRow(`  ${dot(isEncryptionEnabled())} ${W}File Enc${R}   ${isEncryptionEnabled() ? `${GN}ON${R}` : `${RD}OFF${R}`}`, IW));
  L.push(boxBot(IW));
  L.push('');

  // Statistics
  const sItems: [string, string, string][] = [
    ['Online',   `${st.o}`,  '🟢'],
    ['Users',    `${st.u}`,  '👥'],
    ['Chats',    `${st.ch}`, '💬'],
    ['Channels', `${st.cn}`, '📢'],
    ['Messages', `${st.m}`,  '📨'],
    ['Uptime',   fmtUp(),    '⏱ '],
    ['Memory',   fmtMem(),   '🧠'],
    ['Platform', `${os.platform()} ${os.arch()}`, '💻'],
  ];
  L.push(`  ${B}${W}📊 STATISTICS${R}`);
  L.push(boxTop(IW));
  for (const [label, value, icon] of sItems) {
    L.push(boxRow(`  ${icon} ${W}${label}${R}  ${value}`, IW));
  }
  L.push(boxBot(IW));
  L.push('');

  // Event Log
  L.push(`  ${B}${W}📋 EVENT LOG${R}`);
  L.push(boxTop(IW));
  if (logBuf.length === 0) {
    L.push(boxRow(`  ${D}${GR}Waiting for events...${R}`, IW));
  } else {
    for (const e of logBuf) {
      L.push(boxRow(`  ${GR}${e.t}${R}  ${badge(e.l)}  ${e.m}`, IW));
    }
  }
  L.push(boxBot(IW));

  // Footer
  L.push('');
  L.push(center(`${D}${GR}Ctrl+C to stop${R}`, TW));

  const out = L.join('\n');
  if (out !== lastOut) {
    process.stdout.write('\x1b[H' + out + '\x1b[J');
    lastOut = out;
  }
  busy = false;
}

// ─── Init ─────────────────────────────────────────────────────────────
let inited = false;

export async function initTUI() {
  if (inited) return;
  inited = true;

  const oLog = console.log;
  const oWarn = console.warn;
  const oErr = console.error;

  console.log = (...args: any[]) => {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    if (!msg) return;
    if (msg.includes('БД подключена')) addLog('ok', 'Database connected');
    else if (msg.includes('сброшены в offline')) addLog('ok', 'Users reset to offline');
    else if (msg.includes('Serving web from')) addLog('info', 'Static: web/dist');
    else if (msg.includes('DEVICE AUTH')) return;
    else if (msg.includes('NFT STOCK')) {
      if (msg.includes('No cards')) addLog('info', 'NFT: no stock cards');
      else addLog('info', msg.replace(/\[NFT STOCK\]\s*/, ''));
    } else addLog('info', msg);
  };

  console.warn = (...args: any[]) => {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    addLog('warn', msg);
  };

  console.error = (...args: any[]) => {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    addLog('error', msg);
  };

  await render();
  setInterval(() => render(), 30000);

  const restore = () => { console.log = oLog; console.warn = oWarn; console.error = oErr; };
  process.on('SIGINT', () => { restore(); process.exit(0); });
  process.on('SIGTERM', () => { restore(); process.exit(0); });
}

export function log(level: LogEntry['l'], message: string) {
  addLog(level, message);
}
