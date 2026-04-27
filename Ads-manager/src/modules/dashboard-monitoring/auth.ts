import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../config/env.js';

type SessionPayload = {
  sub: string;
  iat: number;
  exp: number;
  nonce: string;
};

type LoginState = {
  failures: number;
  blockedUntil: number | null;
  updatedAt: number;
};

const COOKIE_NAME = 'metaads_dashboard_session';
const LOGIN_STATE_TTL_MS = Math.max(env.DASHBOARD_LOGIN_BLOCK_MINUTES, 1) * 60 * 1000;
const loginStates = new Map<string, LoginState>();

function toBase64Url(value: Buffer | string) {
  return Buffer.from(value).toString('base64url');
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url');
}

function signTokenSegment(value: string) {
  return createHmac('sha256', env.DASHBOARD_SESSION_SECRET ?? '').update(value).digest('base64url');
}

function encodeSession(payload: SessionPayload) {
  const body = toBase64Url(JSON.stringify(payload));
  const signature = signTokenSegment(body);
  return `${body}.${signature}`;
}

function decodeSession(token: string) {
  const [body, signature] = token.split('.');
  if (!body || !signature) {
    return null;
  }

  const expectedSignature = signTokenSegment(body);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(body).toString('utf8')) as SessionPayload;
    if (!payload?.sub || typeof payload.exp !== 'number') {
      return null;
    }

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader?: string) {
  const cookies = new Map<string, string>();
  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName) {
      continue;
    }

    cookies.set(rawName, rawValue.join('='));
  }

  return cookies;
}

function normalizeHash(value: string) {
  return value.trim();
}

function createPasswordHash(secret: string, saltBase64?: string) {
  const salt = saltBase64 ? Buffer.from(saltBase64, 'base64url') : randomBytes(16);
  const derived = scryptSync(secret, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

function verifyPassword(password: string) {
  if (env.DASHBOARD_PASSWORD_HASH) {
    const normalized = normalizeHash(env.DASHBOARD_PASSWORD_HASH);
    const [algorithm, saltBase64, digestBase64] = normalized.split('$');
    if (algorithm !== 'scrypt' || !saltBase64 || !digestBase64) {
      return false;
    }

    const candidate = createPasswordHash(password, saltBase64);
    const candidateBuffer = Buffer.from(candidate);
    const digestBuffer = Buffer.from(normalized);
    if (candidateBuffer.length !== digestBuffer.length) {
      return false;
    }
    return timingSafeEqual(candidateBuffer, digestBuffer);
  }

  if (!env.DASHBOARD_PASSWORD) {
    return false;
  }

  const passwordBuffer = Buffer.from(password);
  const expectedBuffer = Buffer.from(env.DASHBOARD_PASSWORD);
  if (passwordBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(passwordBuffer, expectedBuffer);
}

function setCookie(reply: FastifyReply, value: string, maxAgeSeconds: number) {
  const parts = [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
  ];

  if (env.DASHBOARD_COOKIE_SECURE) {
    parts.push('Secure');
  }

  reply.header('set-cookie', parts.join('; '));
}

function getClientKey(request: FastifyRequest) {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
    return forwardedFor.split(',')[0]!.trim();
  }

  return request.ip;
}

function getLoginState(clientKey: string) {
  const state = loginStates.get(clientKey);
  if (!state) {
    return { failures: 0, blockedUntil: null, updatedAt: Date.now() } satisfies LoginState;
  }

  if (Date.now() - state.updatedAt > LOGIN_STATE_TTL_MS) {
    loginStates.delete(clientKey);
    return { failures: 0, blockedUntil: null, updatedAt: Date.now() } satisfies LoginState;
  }

  return state;
}

function persistLoginState(clientKey: string, state: LoginState) {
  loginStates.set(clientKey, state);
}

export function getDashboardSession(request: FastifyRequest) {
  if (!env.DASHBOARD_AUTH_ENABLED) {
    return {
      ok: true,
      username: 'dashboard-anonymous'
    } as const;
  }

  const cookies = parseCookies(request.headers.cookie);
  const token = cookies.get(COOKIE_NAME);
  if (!token) {
    return null;
  }

  const payload = decodeSession(token);
  if (!payload) {
    return null;
  }

  return {
    ok: true,
    username: payload.sub
  } as const;
}

export function clearDashboardSession(reply: FastifyReply) {
  setCookie(reply, '', 0);
}

export function issueDashboardSession(reply: FastifyReply, username: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: username,
    iat: now,
    exp: now + env.DASHBOARD_SESSION_TTL_SECONDS,
    nonce: randomBytes(12).toString('base64url')
  };

  setCookie(reply, encodeSession(payload), env.DASHBOARD_SESSION_TTL_SECONDS);
}

export function authenticateDashboardLogin(request: FastifyRequest, username: string, password: string) {
  const clientKey = getClientKey(request);
  const currentState = getLoginState(clientKey);

  if (currentState.blockedUntil && currentState.blockedUntil > Date.now()) {
    return {
      ok: false,
      code: 'LOGIN_RATE_LIMITED',
      retryAfterSeconds: Math.ceil((currentState.blockedUntil - Date.now()) / 1000)
    } as const;
  }

  const usernameMatches = username === env.DASHBOARD_USERNAME;
  const passwordMatches = verifyPassword(password);

  if (!usernameMatches || !passwordMatches) {
    const failures = currentState.failures + 1;
    const blockedUntil = failures >= env.DASHBOARD_LOGIN_MAX_ATTEMPTS
      ? Date.now() + (env.DASHBOARD_LOGIN_BLOCK_MINUTES * 60 * 1000)
      : null;

    persistLoginState(clientKey, {
      failures,
      blockedUntil,
      updatedAt: Date.now()
    });

    return {
      ok: false,
      code: blockedUntil ? 'LOGIN_RATE_LIMITED' : 'LOGIN_INVALID',
      retryAfterSeconds: blockedUntil ? env.DASHBOARD_LOGIN_BLOCK_MINUTES * 60 : undefined
    } as const;
  }

  loginStates.delete(clientKey);

  return {
    ok: true,
    username: env.DASHBOARD_USERNAME
  } as const;
}

export function dashboardSecurityHeaders(reply: FastifyReply) {
  reply.header('cache-control', 'no-store, max-age=0');
  reply.header('pragma', 'no-cache');
  reply.header('x-frame-options', 'DENY');
  reply.header('x-content-type-options', 'nosniff');
  reply.header('referrer-policy', 'no-referrer');
  reply.header(
    'permissions-policy',
    'accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), usb=(), web-share=()'
  );
  reply.header(
    'content-security-policy',
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https:; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
  );
}

export function requireDashboardAuth(request: FastifyRequest, reply: FastifyReply) {
  dashboardSecurityHeaders(reply);

  const session = getDashboardSession(request);
  if (!session) {
    reply.code(302);
    reply.header('location', '/dashboard/login');
    return reply.send();
  }

  return session;
}

export function createPasswordHashForDocs(password: string) {
  return createPasswordHash(password);
}
