import 'dotenv/config';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { nanoid } from 'nanoid';
import pg from 'pg';

const fastify = Fastify({ logger: false });
const { Pool } = pg;

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: process.env.DB_PORT,
});

const AGENTS = {
    mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    tablet: 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36'
};

fastify.register(multipart, { limits: { fileSize: 200 * 1024 * 1024 } });

fastify.register(staticFiles, {
    root: path.join(process.cwd(), 'public'),
    prefix: '/',
    wildcard: false
});

fastify.register(staticFiles, {
    root: path.join(process.cwd(), 'uploads'),
    prefix: '/u/',
    decorateReply: false,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.apk')) res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    }
});

fastify.addHook('onRequest', async (request, reply) => {
    const url = request.raw.url;
    if (url.endsWith('.html') && !url.startsWith('/u/')) {
        return reply.redirect(301, url.replace(/\.html$/, ''));
    }
});

fastify.get('/url', async (req, res) => res.sendFile('url.html'));
fastify.get('/deceiver', async (req, res) => res.sendFile('deceiver.html'));

fastify.post('/upload', async (req, reply) => {
    try {
        const data = await req.file();
        if (!data) return reply.code(400).send({ error: 'No hay archivo' });
        const allowedExts = ['.apk', '.mp3', '.mp4', '.png', '.jpg', '.jpeg', '.gif'];
        const ext = path.extname(data.filename).toLowerCase();
        if (!allowedExts.includes(ext)) return reply.code(400).send({ error: 'Extensión no permitida' });
        const id = nanoid(8); 
        const fileName = `${id}${ext}`;
        const uploadPath = path.join(process.cwd(), 'uploads', fileName);
        const fileStream = fs.createWriteStream(uploadPath);
        await new Promise((resolve, reject) => {
            data.file.pipe(fileStream);
            data.file.on('end', resolve);
            fileStream.on('error', reject);
        });
        await pool.query('INSERT INTO files (id, original_name, filename) VALUES ($1, $2, $3)', [id, data.filename, fileName]);
        return { url: `/u/${fileName}` };
    } catch (err) {
        return reply.code(500).send({ error: 'Fallo en la subida' });
    }
});

fastify.post('/shorten', async (req, reply) => {
    try {
        const { url, customPath, type, device } = req.body;
        if (!url) return reply.code(400).send({ error: 'URL requerida' });
        let target = url.startsWith('http') ? url : `https://${url}`;
        const slug = customPath ? customPath.trim().toLowerCase() : nanoid(6);
        const mode = type === 'deceiver' ? 'deceiver' : 'short';
        const devMode = device || 'desktop';
        const checkExist = await pool.query('SELECT slug FROM urls WHERE slug = $1', [slug]);
        if (checkExist.rows.length > 0) return reply.code(400).send({ error: 'Ruta ya existe' });
        await pool.query('INSERT INTO urls (slug, target_url, type, device) VALUES ($1, $2, $3, $4)', [slug, target, mode, devMode]);
        return { shortUrl: `${mode === 'deceiver' ? '/d/' : '/r/'}${slug}` };
    } catch (err) {
        return reply.code(500).send({ error: 'Error en base de datos' });
    }
});

fastify.get('/r/:slug', async (req, reply) => {
    const result = await pool.query('SELECT target_url FROM urls WHERE slug = $1 AND type = $2', [req.params.slug.toLowerCase(), 'short']);
    if (result.rows.length === 0) return reply.sendFile('404.html');
    return reply.redirect(result.rows[0].target_url);
});

fastify.get('/d/:slug', async (req, reply) => {
    const result = await pool.query('SELECT target_url, device FROM urls WHERE slug = $1 AND type = $2', [req.params.slug.toLowerCase(), 'deceiver']);
    if (result.rows.length === 0) return reply.sendFile('404.html');
    const { target_url, device } = result.rows[0];
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Yotsuba Viewer</title><style>body,html{margin:0;padding:0;height:100%;overflow:hidden;background:#000}iframe{width:100%;height:100%;border:none}</style></head><body><iframe src="${target_url}"></iframe></body></html>`;
    reply.type('text/html').send(html);
});

fastify.setNotFoundHandler((request, reply) => reply.sendFile('404.html'));

const start = async () => {
    try {
        if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, original_name TEXT, filename TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS urls (id SERIAL PRIMARY KEY, slug TEXT UNIQUE, target_url TEXT, type TEXT DEFAULT 'short', device TEXT DEFAULT 'desktop', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        `);
        await pool.query("ALTER TABLE urls ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'short'");
        await pool.query("ALTER TABLE urls ADD COLUMN IF NOT EXISTS device TEXT DEFAULT 'desktop'");
        await fastify.listen({ port: process.env.PORT || 3032, host: '0.0.0.0' });
        console.log(`🚀 [YOTSUBA] Online en puerto 3032`);
    } catch (err) {
        process.exit(1);
    }
};
start();