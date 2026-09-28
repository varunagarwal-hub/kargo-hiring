// Session token helpers. Web Crypto only, so this runs in both proxy.ts and server code.
export const SESSION_COOKIE = 'kargo_session'
export const SESSION_DAYS = 14

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export async function makeToken(secret: string, now = Date.now()): Promise<string> {
  const exp = String(now + SESSION_DAYS * 86400_000)
  return `${exp}.${await hmac(secret, exp)}`
}

export async function verifyToken(secret: string | undefined, token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!secret || !token) return false
  const [exp, sig] = token.split('.')
  if (!exp || !sig || Number(exp) < now) return false
  return safeEqual(sig, await hmac(secret, exp))
}

export async function passwordMatches(input: string, expected: string, secret: string): Promise<boolean> {
  // Compare HMACs so the comparison is constant-length.
  return safeEqual(await hmac(secret, input), await hmac(secret, expected))
}
