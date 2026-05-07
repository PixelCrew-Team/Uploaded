import 'dotenv/config';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { nanoid } from 'nanoid';
import pg from 'pg';
import fetch from 'node-fetch';

const fastify = Fastify({ logger: false });
const { Pool } = pg;

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: process.env.DB_PORT,
});

fastify.register(multipart, { 
    limits: { fileSize: 200 * 1024 * 1024 } 
});

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
        const cleanPath = url.replace(/\.html$/, '');
        return reply.redirect(301, cleanPath);
    }
});

fastify.get('/url', async (request, reply) => {
    return reply.sendFile('url.html');
});

fastify.get('/deceiver', async (request, reply) => {
    return reply.sendFile('deceiver.html');
});

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
        const { url, customPath, type } = req.body;
        if (!url) return reply.code(400).send({ error: 'URL requerida' });
        
        const slug = customPath ? customPath.trim().toLowerCase() : nanoid(6);
        const mode = type === 'deceiver' ? 'deceiver' : 'short';

        const publicPath = path.join(process.cwd(), 'public');
        const filesInPublic = fs.readdirSync(publicPath);
        const isSystemFile = filesInPublic.some(file => {
            const nameWithoutExt = path.parse(file).name.toLowerCase();
            return nameWithoutExt === slug || file.toLowerCase() === slug;
        });

        if (isSystemFile) return reply.code(400).send({ error: 'Ruta reservada por el sistema' });

        const checkExist = await pool.query('SELECT slug FROM urls WHERE slug = $1', [slug]);
        if (checkExist.rows.length > 0) return reply.code(400).send({ error: 'La ruta ya está en uso' });

        await pool.query('INSERT INTO urls (slug, target_url, type) VALUES ($1, $2, $3)', [slug, url, mode]);
        const prefix = mode === 'deceiver' ? '/d/' : '/r/';
        return { shortUrl: `${prefix}${slug}` };
    } catch (err) {
        return reply.code(500).send({ error: 'Error interno' });
    }
});

fastify.get('/r/:slug', async (req, reply) => {
    const { slug } = req.params;
    const result = await pool.query('SELECT target_url, type FROM urls WHERE slug = $1', [slug.toLowerCase()]);
    if (result.rows.length === 0) return reply.sendFile('404.html');
    return reply.redirect(result.rows[0].target_url);
});

fastify.get('/d/:slug', async (req, reply) => {
    try {
        const { slug } = req.params;
        const result = await pool.query('SELECT target_url FROM urls WHERE slug = $1 AND type = $2', [slug.toLowerCase(), 'deceiver']);
        
        if (result.rows.length === 0) return reply.sendFile('404.html');
        
        const target = result.rows[0].target_url;
        const response = await fetch(target);
        const body = await response.text();
        
        reply.type('text/html').send(body);
    } catch (err) {
        return reply.code(500).send('Error al conectar con el sitio remoto');
    }
});

fastify.setNotFoundHandler((request, reply) => {
    reply.sendFile('404.html');
});

const start = async () => {
    try {
        if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY, 
                original_name TEXT, 
                filename TEXT, 
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS urls (
                id SERIAL PRIMARY KEY,
                slug TEXT UNIQUE,
                target_url TEXT,
                type TEXT DEFAULT 'short',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        const port = process.env.PORT || 3032;
        await fastify.listen({ port: port, host: '0.0.0.0' });
        console.log(`🚀 [YOTSUBA] Online en puerto ${port}`);
    } catch (err) {
        process.exit(1);
    }
};

start();