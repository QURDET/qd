// Cloudflare Pages Function — handles all /api/* routes
// Data is stored in Cloudflare KV (bound as QD_DATA)

const DEFAULT_DATA = {
    contacts: [],
    interests: [],
    members: [],
    settings: { googleClientId: '' },
    users: [
        { id: 'u1', username: 'mamda006.310', password: 'HelloAbbas2023!', name: 'Abbas M',  role: 'admin' },
        { id: 'u2', username: 'zjets988',     password: 'ZahraJets2024!',  name: 'Zahra J',  role: 'staff' },
    ],
    inventory: [
        { id: 'p1', name: 'Shia Deal Standard Pack',      sku: 'SD-001', price: 12.99, qty: 48, threshold: 10, notes: '' },
        { id: 'p2', name: 'Shia Deal Deluxe Pack',        sku: 'SD-002', price: 19.99, qty: 22, threshold:  8, notes: '' },
        { id: 'p3', name: 'Shia Deal Expansion Pack',     sku: 'SD-EXP', price:  8.99, qty:  7, threshold: 10, notes: 'Running low — reorder soon' },
        { id: 'p4', name: 'Shia Deal Bundle (Std + Exp)', sku: 'SD-BUN', price: 19.99, qty:  3, threshold:  5, notes: '' },
    ],
};

// ── Email (sent through Resend — needs the RESEND_API_KEY secret in Cloudflare) ──
const EMAIL_DOMAIN   = 'qurandetectives.co.uk';
const DEFAULT_EMAIL  = {
    senders: [{ address: 'contact@' + EMAIL_DOMAIN, name: "Qur'an Detectives" }],
    permissions: {},                       // { userId: ['address@qurandetectives.co.uk', ...] }
    notifyTo: 'qurandetectives@gmail.com', // where Contact Us alerts go
    signOff: 'Best Regards,',              // sign-off used on every email (set by builders)
    sent: [],                              // log of emails sent from the dashboard
};
const SESSION_TTL = 60 * 60 * 12;          // staff sign-ins last 12 hours

const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

const SITE   = 'https://' + EMAIL_DOMAIN;
const SOCIAL = [
    { label: 'Instagram', url: 'https://www.instagram.com/qurandetectives/' },
];
const LINK = 'color:#7B3F5E;text-decoration:underline';

// Splits "message ... — On <date>, X wrote: > quoted" so the signature can go above the quote
function splitQuote(body) {
    const m = String(body).match(/\n*(— On [^\n]* wrote:\n[\s\S]*)$/);
    return m ? { main: body.slice(0, m.index), quote: m[1] } : { main: body, quote: '' };
}

function paragraphsHtml(text) {
    return escHtml(text).split(/\n{2,}/).filter(p => p.trim()).map(p =>
        `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`).join('');
}

// sig: { signOff, name, email }
function signatureHtml(sig) {
    const lines = [];
    if (sig.signOff) lines.push(`<div style="margin-bottom:14px">${escHtml(sig.signOff)}</div>`);
    lines.push(`<div style="font-weight:bold;color:#111">${escHtml(sig.name)}</div>`);
    lines.push('<div style="height:10px;line-height:10px">&nbsp;</div>');
    if (sig.email) lines.push(`<div><a href="mailto:${escHtml(sig.email)}" style="${LINK}">${escHtml(sig.email)}</a></div>`);
    lines.push(`<div><a href="${SITE}" style="${LINK}">${EMAIL_DOMAIN}</a></div>`);
    lines.push(`<div style="margin-top:14px"><a href="${SITE}"><img src="${SITE}/email-logo.png" width="72" height="72" alt="Qur'an Detectives" style="display:block;border:0;width:72px;height:72px;border-radius:50%"></a></div>`);
    lines.push(`<div style="margin-top:12px;font-size:13px">${SOCIAL.map(s =>
        `<a href="${s.url}" style="color:#7B3F5E;text-decoration:none;font-weight:bold">${s.label}</a>`).join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</div>`);
    return `<div style="margin-top:22px;color:#222">${lines.join('')}</div>`;
}

function signatureText(sig) {
    const out = [];
    if (sig.signOff) out.push(sig.signOff, '');
    out.push(sig.name);
    out.push('');
    if (sig.email) out.push(sig.email);
    out.push(EMAIL_DOMAIN);
    return out.join('\n');
}

function noReplyHtml(contactAddr) {
    return `<div style="margin-top:28px;padding-top:12px;border-top:1px solid #e3e3e3;font-size:12px;color:#777;line-height:1.5">
<strong>Please do not reply to this email — this mailbox is not monitored.</strong><br>
If you need to get in touch, email <a href="mailto:${escHtml(contactAddr)}" style="color:#7B3F5E">${escHtml(contactAddr)}</a> or use our <a href="${SITE}/contactus.html" style="color:#7B3F5E">contact form</a>.</div>`;
}
function noReplyText(contactAddr) {
    return `Please do not reply to this email — this mailbox is not monitored.\nIf you need to get in touch, email ${contactAddr} or use our contact form: ${SITE}/contactus.html`;
}

// Builds a normal-looking email: message, signature, (quoted original), (no-reply notice)
// opts: { signature, noReplyContact }
function buildEmail(bodyText, opts = {}) {
    const { main, quote } = splitQuote(String(bodyText || ''));
    let html = paragraphsHtml(main);
    let text = main.trim();
    if (opts.signature) { html += signatureHtml(opts.signature); text += '\n\n' + signatureText(opts.signature); }
    if (quote) {
        const [first, ...rest] = quote.split('\n');
        html += `<div style="margin-top:24px;color:#666;font-size:13px">${escHtml(first)}</div>
<div style="margin-top:6px;padding-left:12px;border-left:3px solid #ddd;color:#666;font-size:13px">${escHtml(rest.map(l => l.replace(/^> ?/, '')).join('\n')).replace(/\n/g, '<br>')}</div>`;
        text += '\n\n' + quote;
    }
    if (opts.noReplyContact) { html += noReplyHtml(opts.noReplyContact); text += '\n\n---\n' + noReplyText(opts.noReplyContact); }
    return {
        text,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;padding:0"><div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222;max-width:640px;padding:4px 2px">${html}</div></body></html>`,
    };
}

async function sendEmail(env, msg) {
    if (!env.RESEND_API_KEY) throw new Error('Email is not set up yet — RESEND_API_KEY is missing in Cloudflare.');
    const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || ('Email service error ' + r.status));
    return data;
}

// Checks the signature Resend puts on webhooks, so nobody can post fake emails into the inbox
async function verifyResendWebhook(secret, headers, rawBody) {
    const id = headers.get('svix-id'), ts = headers.get('svix-timestamp'), sigHeader = headers.get('svix-signature');
    if (!secret || !id || !ts || !sigHeader) return false;
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 5 * 60) return false;   // older than 5 minutes
    const keyBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${rawBody}`));
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
    return sigHeader.split(' ').some(part => {
        const sig = part.split(',')[1] || '';
        if (sig.length !== expected.length) return false;
        let diff = 0;
        for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
        return diff === 0;
    });
}

// "Name <a@b.com>" -> "a@b.com"
function bareAddress(a) {
    const m = String(a || '').match(/<([^>]+)>/);
    return (m ? m[1] : String(a || '')).trim().toLowerCase();
}
function addrList(v) {
    if (!v) return [];
    return (Array.isArray(v) ? v : String(v).split(',')).map(bareAddress).filter(Boolean);
}

const INBOX_MAX = 1000;

// ── Instagram (Instagram API with Instagram Login) ──
const IG_API        = 'https://graph.instagram.com';
const IG_CACHE_MINS = 30;     // fetch fresh posts from Instagram at most every 30 minutes
const IG_MAX_POSTS  = 600;
const IG_MEDIA_FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}';

// "https://www.instagram.com/p/ABC123/?igsh=..." -> { kind: 'p', code: 'ABC123', url: 'https://www.instagram.com/p/ABC123/' }
function igParseLink(raw) {
    const m = String(raw || '').trim().match(/^https?:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9._]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,40})/i);
    if (!m) return null;
    const kind = m[1].toLowerCase() === 'reels' ? 'reel' : m[1].toLowerCase();
    return { kind, code: m[2], url: `https://www.instagram.com/${kind}/${m[2]}/` };
}
function safeEqual(a, b) {
    a = String(a || ''); b = String(b || '');
    if (!a || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

async function igGet(path, token) {
    const sep = path.includes('?') ? '&' : '?';
    const r = await fetch(`${IG_API}${path}${sep}access_token=${encodeURIComponent(token)}`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) throw new Error((data.error && data.error.message) || ('Instagram error ' + r.status));
    return data;
}

// Gets the profile and every post (following Instagram's pages of 50)
async function igFetchAll(token) {
    const profile = await igGet('/me?fields=user_id,username,name,profile_picture_url,followers_count,media_count', token);
    const posts = [];
    let next = `${IG_API}/me/media?fields=${encodeURIComponent(IG_MEDIA_FIELDS)}&limit=50&access_token=${encodeURIComponent(token)}`;
    while (next && posts.length < IG_MAX_POSTS) {
        const r = await fetch(next);
        const data = await r.json().catch(() => ({}));
        if (!r.ok || data.error) throw new Error((data.error && data.error.message) || ('Instagram error ' + r.status));
        for (const m of (data.data || [])) {
            posts.push({
                id: m.id, type: m.media_type, url: m.media_url || '', thumb: m.thumbnail_url || m.media_url || '',
                caption: m.caption || '', link: m.permalink, date: m.timestamp,
                children: ((m.children && m.children.data) || []).map(c => ({ type: c.media_type, url: c.media_url || '', thumb: c.thumbnail_url || c.media_url || '' })),
            });
        }
        next = data.paging && data.paging.next;
    }
    return {
        profile: {
            username: profile.username, name: profile.name || '', picture: profile.profile_picture_url || '',
            followers: profile.followers_count ?? null, postCount: profile.media_count ?? posts.length,
        },
        posts,
    };
}

const CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    });
}

export async function onRequest(context) {
    const { request, env } = context;
    const url    = new URL(request.url);
    const parts = url.pathname.split('/api/'); const route = parts.length > 1 ? parts[1] : '';
    const method = request.method;

    if (method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });

    async function readData() {
        const raw = await env.QD_DATA.get('data');
        if (!raw) {
            await env.QD_DATA.put('data', JSON.stringify(DEFAULT_DATA));
            return DEFAULT_DATA;
        }
        const d = JSON.parse(raw);
        if (!d.settings) d.settings = { googleClientId: '' };
        if (!d.members) d.members = [];
        if (d.users) {
            d.users = d.users.map(u => {
                if (!u.password) {
                    const def = DEFAULT_DATA.users.find(du => du.id === u.id);
                    if (def) return { ...u, password: def.password };
                }
                return u;
            });
        }
        return d;
    }

    async function writeData(d) {
        await env.QD_DATA.put('data', JSON.stringify(d));
    }

    // ── Staff sessions ──
    // Signing in gives the browser a random token. Every protected request must send it
    // (Authorization: Bearer <token>), and the server looks up who it belongs to.
    async function createSession(userId) {
        const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        await env.QD_DATA.put('sess:' + token, userId, { expirationTtl: SESSION_TTL });
        return token;
    }
    function bearerToken() {
        const h = request.headers.get('Authorization') || '';
        return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    }
    async function sessionUser(d) {
        const token = bearerToken();
        if (!token) return null;
        const uid = await env.QD_DATA.get('sess:' + token);
        if (!uid) return null;
        return (d.users || []).find(u => u.id === uid) || null;
    }
    function safeUser(u) { const c = Object.assign({}, u); delete c.password; return c; }

    function emailCfg(d) {
        if (!d.email) d.email = JSON.parse(JSON.stringify(DEFAULT_EMAIL));
        if (!Array.isArray(d.email.senders)) d.email.senders = [];
        if (!d.email.permissions) d.email.permissions = {};
        if (!Array.isArray(d.email.sent)) d.email.sent = [];
        if (d.email.notifyTo === undefined) d.email.notifyTo = DEFAULT_EMAIL.notifyTo;
        if (typeof d.email.signOff !== 'string') d.email.signOff = DEFAULT_EMAIL.signOff;
        return d.email;
    }
    // The address people should write to (first sender that isn't a no-reply address)
    function contactAddress(d) {
        const s = emailCfg(d).senders.find(x => !x.noReply);
        return s ? s.address : 'contact@' + EMAIL_DOMAIN;
    }
    // A team member's signature (the sign-off is the same for everyone — set by builders)
    function userSignature(d, user, senderAddress) {
        return { signOff: emailCfg(d).signOff, name: user.name, email: senderAddress };
    }
    // Which "from" addresses this person may send from
    function allowedSenders(d, user) {
        const cfg = emailCfg(d);
        if (user.role === 'builder') return cfg.senders;
        const mine = (cfg.permissions[user.id] || []).map(a => a.toLowerCase());
        return cfg.senders.filter(s => mine.includes(s.address.toLowerCase()));
    }

    // ── Inbox storage: a list of message summaries + one KV entry per message body ──
    async function readInbox() {
        const raw = await env.QD_DATA.get('inbox:index');
        return raw ? JSON.parse(raw) : [];
    }
    async function writeInbox(list) {
        await env.QD_DATA.put('inbox:index', JSON.stringify(list));
    }
    // Can this person see this message? (it was sent to one of their addresses)
    function canSeeMessage(d, user, m) {
        if (user.role === 'builder') return true;
        const mine = allowedSenders(d, user).map(s => s.address.toLowerCase());
        return [...(m.to || []), ...(m.cc || [])].some(a => mine.includes(a));
    }

    // ── Instagram helpers ──
    async function igToken() {
        const raw = await env.QD_DATA.get('ig:token');
        return raw ? JSON.parse(raw) : null;
    }
    // Long-lived tokens last 60 days. Swap for a fresh one once it's a week old, so it never runs out.
    async function igMaybeRefresh(t) {
        if (!t || Date.now() - (t.refreshedAt || t.savedAt) < 7 * 86400000) return;
        try {
            const data = await igGet('/refresh_access_token?grant_type=ig_refresh_token', t.token);
            if (data.access_token) {
                await env.QD_DATA.put('ig:token', JSON.stringify({
                    ...t, token: data.access_token, refreshedAt: Date.now(),
                    expiresAt: Date.now() + (data.expires_in || 5184000) * 1000, lastError: '',
                }));
            }
        } catch (e) {
            await env.QD_DATA.put('ig:token', JSON.stringify({ ...t, lastError: 'Refresh failed: ' + e.message }));
        }
    }
    async function igRefreshCache(t) {
        const fresh = await igFetchAll(t.token);
        const cache = { ...fresh, fetchedAt: Date.now() };
        await env.QD_DATA.put('ig:cache', JSON.stringify(cache));
        return cache;
    }

    const isAdmin   = u => u && (u.role === 'admin' || u.role === 'builder');
    const isBuilder = u => u && u.role === 'builder';

    // Routes anyone can use. Everything else needs a signed-in staff member.
    const isPublicGet = method === 'GET' && route === 'instagram';
    const isIgAddPost = method === 'POST' && route === 'instagram/posts';   // checks its own key or sign-in
    const PUBLIC_POST = ['login', 'google-login', 'member-login', 'member-google-login', 'contact', 'interest', 'email/inbound'];
    const isPublic = route === 'health' || isPublicGet || isIgAddPost
        || (route === 'settings' && method === 'GET')
        || (method === 'POST' && PUBLIC_POST.includes(route));

    try {
        let me = null;
        if (!isPublic) {
            me = await sessionUser(await readData());
            if (!me) return json({ error: 'Please sign in again.' }, 401);
            if (me.role === 'viewer' && method !== 'GET' && route !== 'logout') {
                return json({ error: 'Your account is read-only.' }, 403);
            }
        }

        // ── INSTAGRAM ──────────────────────────────────────

        // GET /api/instagram — public: profile + all posts for the Instagram page
        if (route === 'instagram' && method === 'GET') {
            const t = await igToken();
            const cacheRaw = await env.QD_DATA.get('ig:cache');
            let cache = cacheRaw ? JSON.parse(cacheRaw) : null;
            if (!t) {
                // No Instagram connection: show the posts added by link (by hand or by an automation)
                const links = JSON.parse((await env.QD_DATA.get('ig:links')) || '[]');
                return new Response(JSON.stringify({ connected: false, mode: 'links', posts: links.map(l => ({ url: l.url, code: l.code, kind: l.kind })) }), {
                    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' },
                });
            }
            const stale = !cache || Date.now() - cache.fetchedAt > IG_CACHE_MINS * 60000;
            if (stale) {
                if (!cache) {
                    try { cache = await igRefreshCache(t); }
                    catch (e) { console.error('Instagram fetch failed:', e.message); return json({ connected: true, error: 'Could not load posts right now.', profile: null, posts: [] }, 502); }
                } else {
                    // Serve what we have straight away, update in the background
                    context.waitUntil(igRefreshCache(t).catch(e => console.error('Instagram refresh failed:', e.message)));
                }
            }
            context.waitUntil(igMaybeRefresh(t));
            return new Response(JSON.stringify({ connected: true, profile: cache.profile, posts: cache.posts, fetchedAt: cache.fetchedAt }), {
                headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
            });
        }

        // POST /api/instagram/posts — add post links. Used by builders in Site Maintenance,
        // or by an automation (e.g. Instinct) sending the secret key in the X-QD-Key header.
        if (route === 'instagram/posts' && method === 'POST') {
            let viaKey = false;
            const keyHeader = request.headers.get('X-QD-Key') || '';
            if (keyHeader) {
                const stored = await env.QD_DATA.get('ig:addKey');
                if (!stored || !safeEqual(keyHeader, stored)) return json({ error: 'Invalid key' }, 401);
                viaKey = true;
            } else {
                me = await sessionUser(await readData());
                if (!me) return json({ error: 'Please sign in again, or send the X-QD-Key header.' }, 401);
                if (!isBuilder(me)) return json({ error: 'Full Access role required.' }, 403);
            }
            const b = await request.json().catch(() => ({}));
            const incoming = [].concat(b.urls || [], b.url || [], b.posts || []).map(x => typeof x === 'string' ? x : (x && x.url));
            if (!incoming.length) return json({ error: 'Send "url" or "urls" with Instagram post links.' }, 400);
            if (incoming.length > 100) return json({ error: 'Maximum 100 links at a time.' }, 400);
            const links = JSON.parse((await env.QD_DATA.get('ig:links')) || '[]');
            const have = new Set(links.map(l => l.code));
            const added = [], skipped = [], invalid = [];
            // Links are given newest-first; add them so the newest ends up at the top
            for (const raw of incoming.slice().reverse()) {
                const p = igParseLink(raw);
                if (!p) { invalid.push(String(raw).slice(0, 200)); continue; }
                if (have.has(p.code)) { skipped.push(p.url); continue; }
                have.add(p.code);
                links.unshift({ ...p, addedAt: Date.now(), addedBy: viaKey ? 'automation' : me.name });
                added.push(p.url);
            }
            await env.QD_DATA.put('ig:links', JSON.stringify(links.slice(0, 1000)));
            return json({ ok: true, added: added.length, alreadyThere: skipped.length, invalid, total: Math.min(links.length, 1000) });
        }

        // GET /api/instagram/posts — builders: the list of added links
        if (route === 'instagram/posts' && method === 'GET') {
            if (!isBuilder(me)) return json({ error: 'Full Access role required.' }, 403);
            return json(JSON.parse((await env.QD_DATA.get('ig:links')) || '[]'));
        }

        // PUT /api/instagram/posts — builders: save a new order (list of codes, top first)
        if (route === 'instagram/posts' && method === 'PUT') {
            if (!isBuilder(me)) return json({ error: 'Full Access role required.' }, 403);
            const b = await request.json();
            const links = JSON.parse((await env.QD_DATA.get('ig:links')) || '[]');
            const byCode = new Map(links.map(l => [l.code, l]));
            const ordered = (b.order || []).map(c => byCode.get(c)).filter(Boolean);
            links.forEach(l => { if (!ordered.includes(l)) ordered.push(l); });
            await env.QD_DATA.put('ig:links', JSON.stringify(ordered));
            return json({ ok: true });
        }

        // DELETE /api/instagram/posts/:code — builders: remove a link
        if (route.startsWith('instagram/posts/') && method === 'DELETE') {
            if (!isBuilder(me)) return json({ error: 'Full Access role required.' }, 403);
            const code = route.slice('instagram/posts/'.length);
            const links = JSON.parse((await env.QD_DATA.get('ig:links')) || '[]');
            await env.QD_DATA.put('ig:links', JSON.stringify(links.filter(l => l.code !== code)));
            return json({ ok: true });
        }

        // GET /api/instagram/key — builders: see the automation key (creates one if needed)
        // POST /api/instagram/key — builders: make a new key (the old one stops working)
        if (route === 'instagram/key' && (method === 'GET' || method === 'POST')) {
            if (!isBuilder(me)) return json({ error: 'Full Access role required.' }, 403);
            let key = method === 'GET' ? await env.QD_DATA.get('ig:addKey') : null;
            if (!key) {
                key = 'qdig_' + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
                await env.QD_DATA.put('ig:addKey', key);
            }
            return json({ key });
        }

        // GET /api/instagram/status — builders: is it connected and working?
        if (route === 'instagram/status' && method === 'GET') {
            if (!isBuilder(me)) return json({ error: 'Full Access role required.' }, 403);
            const t = await igToken();
            const cacheRaw = await env.QD_DATA.get('ig:cache');
            const cache = cacheRaw ? JSON.parse(cacheRaw) : null;
            return json({
                connected: !!t,
                username: t ? t.username : '',
                savedAt: t ? t.savedAt : null,
                expiresAt: t ? t.expiresAt : null,
                lastError: t ? (t.lastError || '') : '',
                fetchedAt: cache ? cache.fetchedAt : null,
                postCount: cache ? cache.posts.length : 0,
            });
        }

        // PUT /api/instagram/token — builders: connect (checks the token works first)
        if (route === 'instagram/token' && method === 'PUT') {
            if (!isBuilder(me)) return json({ error: 'Full Access role required.' }, 403);
            const b = await request.json();
            let token = String(b.token || '').trim();
            if (!token) return json({ error: 'Paste the access token first.' }, 400);
            let profile;
            try { profile = await igGet('/me?fields=user_id,username', token); }
            catch (e) { return json({ error: 'Instagram didn\'t accept that token: ' + e.message }, 400); }
            let expiresAt = Date.now() + 60 * 86400000;
            // A short-lived token (1 hour) can't be refreshed — try swapping it for a 60-day one when an app secret is set
            if (env.INSTAGRAM_APP_SECRET) {
                try {
                    const ex = await igGet('/access_token?grant_type=ig_exchange_token&client_secret=' + encodeURIComponent(env.INSTAGRAM_APP_SECRET), token);
                    if (ex.access_token) { token = ex.access_token; expiresAt = Date.now() + (ex.expires_in || 5184000) * 1000; }
                } catch (e) { /* already long-lived */ }
            }
            const t = { token, username: profile.username, savedAt: Date.now(), refreshedAt: Date.now(), expiresAt, lastError: '' };
            await env.QD_DATA.put('ig:token', JSON.stringify(t));
            try {
                const cache = await igRefreshCache(t);
                return json({ ok: true, username: profile.username, postCount: cache.posts.length });
            } catch (e) {
                return json({ ok: true, username: profile.username, postCount: 0, warning: 'Connected, but posts could not be loaded yet: ' + e.message });
            }
        }

        // POST /api/instagram/refresh — builders: fetch the latest posts now
        if (route === 'instagram/refresh' && method === 'POST') {
            if (!isBuilder(me)) return json({ error: 'Full Access role required.' }, 403);
            const t = await igToken();
            if (!t) return json({ error: 'Instagram is not connected.' }, 400);
            try { const cache = await igRefreshCache(t); return json({ ok: true, postCount: cache.posts.length }); }
            catch (e) { return json({ error: e.message }, 502); }
        }

        // DELETE /api/instagram/token — builders: disconnect
        if (route === 'instagram/token' && method === 'DELETE') {
            if (!isBuilder(me)) return json({ error: 'Full Access role required.' }, 403);
            await env.QD_DATA.delete('ig:token');
            await env.QD_DATA.delete('ig:cache');
            return json({ ok: true });
        }

        // GET /api/me — who is signed in (used to restore a session)
        if (route === 'me' && method === 'GET') {
            const d = await readData();
            return json({ ...safeUser(me), emailSenders: allowedSenders(d, me) });
        }

        // POST /api/logout
        if (route === 'logout' && method === 'POST') {
            await env.QD_DATA.delete('sess:' + bearerToken());
            return json({ ok: true });
        }

        // ── EMAIL ──────────────────────────────────────────

        // POST /api/email/inbound — Resend calls this when an email arrives at @qurandetectives.co.uk
        if (route === 'email/inbound' && method === 'POST') {
            const raw = await request.text();
            if (!(await verifyResendWebhook(env.RESEND_WEBHOOK_SECRET, request.headers, raw))) {
                return json({ error: 'Invalid signature' }, 401);
            }
            const event = JSON.parse(raw);
            if (event.type !== 'email.received') return json({ ok: true, ignored: true });
            const meta = event.data || {};
            const resendId = meta.email_id || meta.id;
            if (!resendId) return json({ error: 'No email id' }, 400);

            const list = await readInbox();
            if (list.some(m => m.resendId === resendId)) return json({ ok: true, duplicate: true }); // Resend retried

            // The webhook only has the basics — fetch the full message
            let full = {};
            try {
                const r = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(resendId)}`, {
                    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}` },
                });
                if (r.ok) full = await r.json();
                else console.error('Could not fetch received email', r.status, await r.text());
            } catch (e) { console.error('Could not fetch received email', e.message); }

            const hdrs = full.headers || {};
            const headerVal = name => {
                if (Array.isArray(hdrs)) { const h = hdrs.find(x => (x.name || '').toLowerCase() === name); return h ? h.value : ''; }
                const k = Object.keys(hdrs).find(x => x.toLowerCase() === name); return k ? hdrs[k] : '';
            };
            const text = String(full.text || '');
            const html = String(full.html || '');
            const snippetSrc = text || html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
            const id = 'm' + Date.now() + Math.random().toString(36).slice(2, 6);
            const msg = {
                id, resendId,
                date: full.created_at || meta.created_at || new Date().toISOString(),
                from: String(full.from || meta.from || ''),
                to: addrList(full.to || meta.to),
                cc: addrList(full.cc || meta.cc),
                replyTo: addrList(full.reply_to)[0] || '',
                subject: String(full.subject || meta.subject || '(no subject)').slice(0, 300),
                snippet: snippetSrc.replace(/\s+/g, ' ').trim().slice(0, 160),
                messageId: String(headerVal('message-id') || full.message_id || meta.message_id || ''),
                attachments: (full.attachments || meta.attachments || []).map(a => a.filename || 'attachment'),
                readBy: [],
            };
            await env.QD_DATA.put('inbox:msg:' + id, JSON.stringify({ text: text.slice(0, 200000), html: html.slice(0, 500000) }));
            list.unshift(msg);
            const removed = list.splice(INBOX_MAX);
            await writeInbox(list);
            await Promise.all(removed.map(m => env.QD_DATA.delete('inbox:msg:' + m.id)));
            return json({ ok: true });
        }

        // GET /api/email/inbox — messages sent to the addresses this person has access to
        if (route === 'email/inbox' && method === 'GET') {
            const d = await readData();
            const list = (await readInbox()).filter(m => canSeeMessage(d, me, m));
            return json(list.map(m => ({ ...m, read: (m.readBy || []).includes(me.id), readBy: undefined })));
        }

        // GET / DELETE /api/email/inbox/:id
        if (route.startsWith('email/inbox/') && (method === 'GET' || method === 'DELETE')) {
            const id = route.slice('email/inbox/'.length);
            const d = await readData();
            const list = await readInbox();
            const m = list.find(x => x.id === id);
            if (!m || !canSeeMessage(d, me, m)) return json({ error: 'Not found' }, 404);
            if (method === 'DELETE') {
                await writeInbox(list.filter(x => x.id !== id));
                await env.QD_DATA.delete('inbox:msg:' + id);
                return json({ ok: true });
            }
            if (!(m.readBy || []).includes(me.id)) {
                m.readBy = [...(m.readBy || []), me.id];
                await writeInbox(list);
            }
            const body = JSON.parse((await env.QD_DATA.get('inbox:msg:' + id)) || '{}');
            return json({ ...m, read: true, readBy: undefined, text: body.text || '', html: body.html || '' });
        }

        // POST /api/email/preview — what an email will look like (signature, no-reply note)
        if (route === 'email/preview' && method === 'POST') {
            const b = await request.json();
            const d = await readData();
            const sender = allowedSenders(d, me).find(s => s.address.toLowerCase() === String(b.from || '').toLowerCase());
            if (!sender) return json({ html: '' });
            const built = buildEmail(String(b.body || ''), {
                signature: userSignature(d, me, sender.noReply ? contactAddress(d) : sender.address),
                noReplyContact: sender.noReply ? contactAddress(d) : '',
            });
            return json({ html: built.html });
        }

        // GET /api/email/senders — addresses the signed-in person can send from
        if (route === 'email/senders' && method === 'GET') {
            return json(allowedSenders(await readData(), me));
        }

        // POST /api/email/send
        if (route === 'email/send' && method === 'POST') {
            const b = await request.json();
            const d = await readData();
            const from = String(b.from || '').toLowerCase();
            const sender = allowedSenders(d, me).find(s => s.address.toLowerCase() === from);
            if (!sender) return json({ error: "You don't have permission to send from that address." }, 403);

            const to = String(b.to || '').split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
            if (!to.length) return json({ error: 'Add at least one recipient.' }, 400);
            if (to.length > 20) return json({ error: 'Maximum 20 recipients per email.' }, 400);
            const bad = to.find(a => !EMAIL_RE.test(a));
            if (bad) return json({ error: 'This email address doesn\'t look right: ' + bad }, 400);

            const subject = String(b.subject || '').trim().slice(0, 200);
            const body    = String(b.body || '').trim().slice(0, 20000);
            if (!subject || !body) return json({ error: 'Please add a subject and a message.' }, 400);

            const replyTo = String(b.replyTo || '').trim();
            if (replyTo && !EMAIL_RE.test(replyTo)) return json({ error: 'The reply-to address doesn\'t look right.' }, 400);

            const built = buildEmail(body, {
                signature: userSignature(d, me, sender.noReply ? contactAddress(d) : sender.address),
                noReplyContact: sender.noReply ? contactAddress(d) : '',
            });
            const msg = {
                from: `${sender.name ? sender.name.replace(/[<>"]/g, '') + ' ' : ''}<${sender.address}>`,
                to, subject, text: built.text, html: built.html,
            };
            if (replyTo) msg.reply_to = replyTo;
            // Replying to an inbox email? Keep it in the same conversation thread for the customer
            const inReplyTo = String(b.inReplyTo || '').trim();
            if (/^<[^<>\s]+>$/.test(inReplyTo)) msg.headers = { 'In-Reply-To': inReplyTo, 'References': inReplyTo };

            let result;
            try { result = await sendEmail(env, msg); }
            catch (e) { return json({ error: e.message }, 502); }

            const cfg = emailCfg(d);
            const sentId = 'e' + Date.now() + Math.random().toString(36).slice(2, 5);
            // Keep the full email exactly as it was sent (with sign-off and signature)
            await env.QD_DATA.put('sent:html:' + sentId, built.html);
            cfg.sent.unshift({
                id: sentId, resendId: result.id || '', date: new Date().toISOString(),
                from: sender.address, to, subject, body: body.slice(0, 2000),
                byId: me.id, byName: me.name,
            });
            const dropped = cfg.sent.slice(300);
            cfg.sent = cfg.sent.slice(0, 300);
            await Promise.all(dropped.map(e => env.QD_DATA.delete('sent:html:' + e.id)));

            // Replying to a Contact Us message? Mark it as replied.
            if (b.contactId) {
                const c = (d.contacts || []).find(x => x.id === b.contactId);
                if (c && c.status !== 'resolved') c.status = 'replied';
            }
            await writeData(d);
            return json({ ok: true, id: result.id });
        }

        // GET /api/email/sent — builders see everything, everyone else sees their own
        if (route === 'email/sent' && method === 'GET') {
            const cfg = emailCfg(await readData());
            return json(isBuilder(me) ? cfg.sent : cfg.sent.filter(e => e.byId === me.id));
        }

        // GET /api/email/sent/:id — the full email as the recipient saw it
        if (route.startsWith('email/sent/') && method === 'GET') {
            const id = route.slice('email/sent/'.length);
            const d = await readData();
            const e = emailCfg(d).sent.find(x => x.id === id);
            if (!e || (!isBuilder(me) && e.byId !== me.id)) return json({ error: 'Not found' }, 404);
            let html = await env.QD_DATA.get('sent:html:' + id);
            if (!html) {
                // Sent before full copies were kept — rebuild it from what was saved
                const sender = emailCfg(d).senders.find(s => s.address === e.from) || { address: e.from };
                const author = (d.users || []).find(u => u.id === e.byId) || { name: e.byName || '' };
                html = buildEmail(e.body || '', {
                    signature: userSignature(d, author, sender.noReply ? contactAddress(d) : sender.address),
                    noReplyContact: sender.noReply ? contactAddress(d) : '',
                }).html;
            }
            return json({ ...e, html });
        }

        // GET /api/email/config — builder only
        if (route === 'email/config' && method === 'GET') {
            if (!isBuilder(me)) return json({ error: 'Full Access role required.' }, 403);
            const cfg = emailCfg(await readData());
            return json({ senders: cfg.senders, permissions: cfg.permissions, notifyTo: cfg.notifyTo, signOff: cfg.signOff, domain: EMAIL_DOMAIN });
        }

        // PUT /api/email/config — builder only: sender addresses + who can use them
        if (route === 'email/config' && method === 'PUT') {
            if (!isBuilder(me)) return json({ error: 'Full Access role required.' }, 403);
            const b = await request.json();
            const d = await readData();
            const cfg = emailCfg(d);

            const seen = new Set();
            const senders = [];
            for (const s of (b.senders || [])) {
                const address = String(s.address || '').trim().toLowerCase();
                if (!address) continue;
                if (!EMAIL_RE.test(address) || !address.endsWith('@' + EMAIL_DOMAIN)) {
                    return json({ error: `"${address}" must be an address ending in @${EMAIL_DOMAIN}` }, 400);
                }
                if (seen.has(address)) continue;
                seen.add(address);
                senders.push({ address, name: String(s.name || '').trim().slice(0, 80), noReply: !!s.noReply });
            }
            const userIds = new Set((d.users || []).map(u => u.id));
            const permissions = {};
            for (const [uid, list] of Object.entries(b.permissions || {})) {
                if (!userIds.has(uid)) continue;
                permissions[uid] = (list || []).map(a => String(a).toLowerCase()).filter(a => seen.has(a));
            }
            const notifyTo = String(b.notifyTo || '').trim();
            if (notifyTo && !EMAIL_RE.test(notifyTo)) return json({ error: 'The alert address doesn\'t look right.' }, 400);

            cfg.senders = senders;
            cfg.permissions = permissions;
            cfg.notifyTo = notifyTo;
            if (typeof b.signOff === 'string') cfg.signOff = b.signOff.trim().slice(0, 60);
            await writeData(d);
            return json({ ok: true });
        }
        // GET /api/health
        if (route === 'health' && method === 'GET') return json({ ok: true });

        // GET /api/settings
        if (route === 'settings' && method === 'GET') return json((await readData()).settings || {});
        // PUT /api/settings
        if (route === 'settings' && method === 'PUT') {
            const d = await readData();
            d.settings = { ...(d.settings || {}), ...await request.json() };
            await writeData(d);
            return json(d.settings);
        }

        // POST /api/google-login
        if (route === 'google-login' && method === 'POST') {
            const { idToken } = await request.json();
            if (!idToken) return json({ error: 'Missing id_token' }, 400);

            const verifyRes = await fetch(
                `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
            );
            const tokenData = await verifyRes.json();
            if (!verifyRes.ok || tokenData.error || tokenData.error_description) {
                return json({ error: 'Invalid or expired Google token' }, 401);
            }
            if (tokenData.email_verified !== 'true' && tokenData.email_verified !== true) {
                return json({ error: 'Google account email not verified' }, 401);
            }

            const d = await readData();
            const clientId = d.settings?.googleClientId;
            if (clientId && tokenData.aud !== clientId) {
                return json({ error: 'Token audience mismatch' }, 401);
            }

            const email = (tokenData.email || '').toLowerCase();
            const user = d.users.find(u => u.googleEmail && u.googleEmail.toLowerCase() === email);
            if (!user) {
                return json({ error: 'No account linked to this Google address. Ask your admin to add it in Team settings.' }, 403);
            }
            const token = await createSession(user.id);
            return json({ user: { ...safeUser(user), token, emailSenders: allowedSenders(d, user) } });
        }

        // POST /api/login - validates credentials server-side, returns user without password
        if (route === 'login' && method === 'POST') {
            const body = await request.json();
            if (!body.username || !body.password) return json({ error: 'Missing credentials' }, 400);
            const d = await readData();
            const user = d.users.find(u => u.username === body.username && u.password === body.password);
            if (!user) return json({ error: 'Invalid credentials' }, 401);
            const token = await createSession(user.id);
            return json({ ...safeUser(user), token, emailSenders: allowedSenders(d, user) });
        }

        // GET /api/inventory
        if (route === 'inventory' && method === 'GET') return json((await readData()).inventory);
        // PUT /api/inventory
        if (route === 'inventory' && method === 'PUT') {
            if (!isAdmin(me)) return json({ error: 'Admin access required.' }, 403);
            const d = await readData();
            d.inventory = await request.json();
            await writeData(d);
            return json(d.inventory);
        }

        // GET /api/users (never expose passwords)
        if (route === 'users' && method === 'GET') {
            const users = (await readData()).users.map(function(u) { var c = Object.assign({}, u); delete c.password; return c; });
            return json(users);
        }
        // PUT /api/users - preserve passwords since client never holds them
        if (route === 'users' && method === 'PUT') {
            const d = await readData();
            const byId = {};
            d.users.forEach(u => { byId[u.id] = u; });
            let incoming = await request.json();
            if (!Array.isArray(incoming)) return json({ error: 'Bad request' }, 400);
            if (!isAdmin(me)) {
                // Not an admin: only accept changes to your own name/username/password/Google email
                const mine = incoming.find(u => u.id === me.id) || {};
                incoming = d.users.map(u => u.id !== me.id ? u : {
                    ...u,
                    name: mine.name || u.name,
                    username: mine.username || u.username,
                    password: mine.password || '',
                    googleEmail: mine.googleEmail !== undefined ? mine.googleEmail : u.googleEmail,
                });
            } else if (!isBuilder(me)) {
                // Admins can't create or edit Full Access (builder) accounts
                incoming = incoming.map(nu => {
                    const old = byId[nu.id];
                    if (old && old.role === 'builder') return { ...old, password: '' };
                    return nu.role === 'builder' ? { ...nu, role: old ? old.role : 'staff' } : nu;
                });
                d.users.filter(u => u.role === 'builder' && !incoming.find(n => n.id === u.id))
                       .forEach(u => incoming.push({ ...u, password: '' }));
            }
            d.users = incoming.map(nu => ({ ...nu, password: nu.password || (byId[nu.id] && byId[nu.id].password) || '' }));
            await writeData(d);
            const safe = d.users.map(function(u) { var c = Object.assign({}, u); delete c.password; return c; });
            return json(safe);
        }

        // GET /api/contacts
        if (route === 'contacts' && method === 'GET') return json((await readData()).contacts || []);

        // POST /api/contact
        if (route === 'contact' && method === 'POST') {
            const b = await request.json();
            if (!b.name || !b.email || !b.subject || !b.message) return json({ error: 'Missing fields' }, 400);
            const d = await readData();
            if (!d.contacts) d.contacts = [];
            const name    = String(b.name).trim().slice(0, 100);
            const email   = String(b.email).trim().slice(0, 200);
            const subject = String(b.subject).trim().slice(0, 200);
            const message = String(b.message).trim().slice(0, 5000);
            if (!EMAIL_RE.test(email)) return json({ error: 'Please enter a valid email address.' }, 400);
            d.contacts.unshift({ id: 'c' + Date.now(), name, email, subject, message, date: new Date().toISOString(), status: 'received' });
            await writeData(d);

            // Send the emails in the background so the form responds straight away
            const cfg = emailCfg(d);
            const autoSender = cfg.senders.find(x => x.noReply) || cfg.senders[0] || { address: 'contact@' + EMAIL_DOMAIN };
            const from = `Qur'an Detectives <${autoSender.address}>`;
            const contactAddr = contactAddress(d);
            const jobs = [];
            if (cfg.notifyTo) {
                // 1) Alert to the team — press Reply to answer the customer directly
                const alertText = `New Contact Us message\n\nFrom: ${name} <${email}>\nSubject: ${subject}\n\n${message}\n\nReply to this email to answer them, or open the staff dashboard: ${SITE}/admin.html`;
                const alert = buildEmail(alertText);
                jobs.push(sendEmail(env, {
                    from, to: [cfg.notifyTo], reply_to: email,
                    subject: `New message: ${subject}`, text: alert.text, html: alert.html,
                }));
            }
            // 2) Automatic reply to the person (fixed wording — their message is not repeated back)
            const firstName = name.split(/\s+/)[0].slice(0, 40);
            const auto = buildEmail(
                `Assalamu alaikum ${firstName},\n\nThank you for getting in touch with Qur'an Detectives. We've received your message and will get back to you as soon as we can, insha'Allah.`,
                {
                    signature: { signOff: cfg.signOff, name: "The Qur'an Detectives Team", email: contactAddr },
                    noReplyContact: autoSender.noReply ? contactAddr : '',
                });
            jobs.push(sendEmail(env, {
                from, to: [email], subject: "We've received your message",
                ...(autoSender.noReply ? {} : (cfg.notifyTo ? { reply_to: cfg.notifyTo } : {})),
                text: auto.text, html: auto.html,
            }));
            context.waitUntil(Promise.allSettled(jobs).then(rs => rs.forEach(r => {
                if (r.status === 'rejected') console.error('Contact email failed:', r.reason && r.reason.message);
            })));
            return json({ ok: true });
        }

        // PUT /api/contacts/:id
        if (route.startsWith('contacts/') && method === 'PUT') {
            const id = route.slice('contacts/'.length);
            const b = await request.json();
            const d = await readData();
            const contact = (d.contacts || []).find(c => c.id === id);
            if (!contact) return json({ error: 'Not found' }, 404);
            Object.assign(contact, b);
            await writeData(d);
            return json({ ok: true });
        }

        // DELETE /api/contacts/:id
        if (route.startsWith('contacts/') && method === 'DELETE') {
            const id = route.slice('contacts/'.length);
            const d = await readData();
            d.contacts = (d.contacts || []).filter(c => c.id !== id);
            await writeData(d);
            return json({ ok: true });
        }

        // GET /api/interests
        if (route === 'interests' && method === 'GET') return json((await readData()).interests || []);

        // POST /api/interest
        if (route === 'interest' && method === 'POST') {
            const b = await request.json();
            if (!b.parentName || !b.email || !b.childName || !b.childAge) return json({ error: 'Missing fields' }, 400);
            const d = await readData();
            if (!d.interests) d.interests = [];
            d.interests.unshift({ id: 'i' + Date.now(), parentName: b.parentName, email: b.email, phone: b.phone || '', childName: b.childName, childAge: b.childAge, programme: b.programme || '', format: b.format || '', message: b.message || '', date: new Date().toISOString(), status: 'new' });
            await writeData(d);
            return json({ ok: true });
        }

        // PUT /api/interests/:id
        if (route.startsWith('interests/') && method === 'PUT') {
            const id = route.slice('interests/'.length);
            const b = await request.json();
            const d = await readData();
            const item = (d.interests || []).find(i => i.id === id);
            if (!item) return json({ error: 'Not found' }, 404);
            Object.assign(item, b);
            await writeData(d);
            return json({ ok: true });
        }

        // DELETE /api/interests/:id
        if (route.startsWith('interests/') && method === 'DELETE') {
            const id = route.slice('interests/'.length);
            const d = await readData();
            d.interests = (d.interests || []).filter(i => i.id !== id);
            await writeData(d);
            return json({ ok: true });
        }

        // POST /api/member-google-login
        if (route === 'member-google-login' && method === 'POST') {
            const { idToken } = await request.json();
            if (!idToken) return json({ error: 'Missing id_token' }, 400);

            const verifyRes = await fetch(
                `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
            );
            const tokenData = await verifyRes.json();
            if (!verifyRes.ok || tokenData.error) {
                return json({ error: 'Invalid or expired Google token' }, 401);
            }
            if (tokenData.email_verified !== 'true' && tokenData.email_verified !== true) {
                return json({ error: 'Google account email not verified' }, 401);
            }

            const d = await readData();
            const clientId = d.settings?.googleClientId;
            if (clientId && tokenData.aud !== clientId) {
                return json({ error: 'Token audience mismatch' }, 401);
            }

            const email = (tokenData.email || '').toLowerCase();

            // Staff users get automatic member access
            const staffUser = (d.users || []).find(u =>
                u.googleEmail && u.googleEmail.toLowerCase() === email
            );
            if (staffUser) {
                return json({ member: {
                    id: 'staff-' + staffUser.id,
                    name: staffUser.name,
                    email: staffUser.googleEmail,
                    plan: 'Staff',
                    active: true,
                    isStaff: true,
                    memberSince: null,
                    expiryDate: null,
                }});
            }

            // Check members (match by email or googleEmail field)
            const member = (d.members || []).find(m =>
                m.active !== false &&
                ((m.email || '').toLowerCase() === email || (m.googleEmail || '').toLowerCase() === email)
            );
            if (!member) {
                return json({ error: 'No member account found for this Google address. Contact us to get access.' }, 403);
            }
            if (member.expiryDate && new Date(member.expiryDate) < new Date()) {
                return json({ error: 'Your membership has expired. Please contact us to renew.' }, 403);
            }
            const safeMember = Object.assign({}, member); delete safeMember.password;
            return json({ member: safeMember });
        }

        // POST /api/member-login
        if (route === 'member-login' && method === 'POST') {
            const body = await request.json();
            if (!body.login || !body.password) return json({ error: 'Missing credentials' }, 400);
            const d = await readData();
            const login = body.login.toLowerCase().trim();
            const member = (d.members || []).find(m =>
                m.active !== false &&
                m.password === body.password &&
                ((m.email || '').toLowerCase() === login || (m.username || '').toLowerCase() === login)
            );
            if (!member) return json({ error: 'Invalid credentials or account not found' }, 401);
            if (member.expiryDate && new Date(member.expiryDate) < new Date()) {
                return json({ error: 'Your membership has expired. Please contact us to renew.' }, 403);
            }
            const safe = Object.assign({}, member); delete safe.password;
            return json({ member: safe });
        }

        // GET /api/members (never expose passwords)
        if (route === 'members' && method === 'GET') {
            const d = await readData();
            const safe = (d.members || []).map(function(m) { var c = Object.assign({}, m); delete c.password; return c; });
            return json(safe);
        }

        // PUT /api/members — preserve passwords since client never holds them
        if (route === 'members' && method === 'PUT') {
            if (!isAdmin(me)) return json({ error: 'Admin access required.' }, 403);
            const d = await readData();
            const byId = {};
            (d.members || []).forEach(m => { byId[m.id] = m; });
            const incoming = await request.json();
            d.members = incoming.map(nm => ({ ...nm, password: nm.password || (byId[nm.id] && byId[nm.id].password) || '' }));
            await writeData(d);
            const safe = d.members.map(function(m) { var c = Object.assign({}, m); delete c.password; return c; });
            return json(safe);
        }

        // POST /api/reset
        if (route === 'reset' && method === 'POST') {
            if (!isBuilder(me)) return json({ error: 'Full Access role required.' }, 403);
            await writeData(DEFAULT_DATA);
            return json({ ok: true });
        }

        return json({ error: 'Not found' }, 404);
    } catch (err) {
        return json({ error: err.message }, 500);
    }
}
