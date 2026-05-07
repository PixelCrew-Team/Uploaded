/* YOTSUBA UPLOADED - ENGINE */
import 'dotenv/config';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { nanoid } from 'nanoid';
import pg from 'pg';

console.log('>>> [SISTEMA] Iniciando configuración...');

const fastify = Fastify({ logger: false });
const { Pool } = pg;

// Validar que el .env cargó
if (!process.env.DB_USER) {
    console.error('>>> [ERROR] No se detectaron las variables del archivo .env');
}

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
});

fastify.register(staticFiles, {
    root: path.join(process.cwd(), 'uploads'),
    prefix: '/u/',
    decorateReply: false,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.apk')) res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    }
});

fastify.setNotFoundHandler((request, reply) => {
    reply.sendFile('404.html');
});

fastify.post('/upload', async (req, reply) => {
    try {
        const data = await req.file();
        if (!data) return reply.code(400).send({ error: 'No hay archivo' });

        const allowedExts = ['.apk', '.mp3', '.mp4', '.png', '.jpg', '.jpeg', '.gif'];
        const ext = path.extname(data.filename).toLowerCase();
        
        if (!allowedExts.includes(ext)) {
            return reply.code(400).send({ error: 'Extensión no permitida' });
        }

        const id = nanoid(8); 
        const fileName = `${id}${ext}`;
        const uploadPath = path.join(process.cwd(), 'uploads', fileName);

        const fileStream = fs.createWriteStream(uploadPath);
        await new Promise((resolve, reject) => {
            data.file.pipe(fileStream);
            data.file.on('end', resolve);
            fileStream.on('error', reject);
        });

        await pool.query(
            'INSERT INTO files (id, original_name, filename) VALUES ($1, $2, $3)', 
            [id, data.filename, fileName]
        );

        return { url: `/u/${fileName}` };
    } catch (err) {
        return reply.code(500).send({ error: 'Fallo en la subida' });
    }
});

const start = async () => {
    try {
        console.log('>>> [DB] Verificando conexión...');
        if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY, 
                original_name TEXT, 
                filename TEXT, 
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('>>> [DB] Tabla verificada/creada.');

        const port = process.env.PORT || 3000;
        await fastify.listen({ port: port, host: '0.0.0.0' });
        console.log(`🚀 [YOTSUBA] Online en puerto ${port}`);
    } catch (err) {
        console.error('>>> [CRITICAL ERROR]:', err);
        process.exit(1);
    }
};

start();
