/* global console, Buffer */
// Gera o par de chaves VAPID (P-256). A pública vai em VAPID_PUBLIC_KEY (wrangler.toml e app),
// a privada em segredo: npx wrangler secret put VAPID_PRIVATE_KEY
import { webcrypto as crypto } from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);
const pub = await crypto.subtle.exportKey('raw', pair.publicKey);
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
console.log('VAPID_PUBLIC_KEY  =', b64url(pub));
console.log('VAPID_PRIVATE_KEY =', jwk.d);
console.log('\nGuarde a privada só como segredo do Worker (nunca no Git).');
