import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { nanoid } from 'nanoid';
import pg from 'pg';

const fastify = Fastify({ logger: true });
const { Pool } = pg;

// Configuración de PostgreSQL (Se llenará con el script de instalación)
const pool = new Pool({
    user: 'yotsuba_user',
    host: 'localhost',
    database: 'yotsuba_db',
    password: 'password_here',
    port: 5432,
});

fastify.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } }); // Límite 100MB

fastify.register(staticFiles, {
    root: path.join(process.cwd(), 'public'),
    prefix: '/',
});

fastify.register(staticFiles, {
    root: path.join(process.cwd(), 'uploads'),
    prefix: '/u/',
    decorateReply: false
});

// Ruta de subida
fastify.post('/upload', async (req, reply) => {
    const data = await req.file();
    const id = nanoid(8); // Tu ID de 8 dígitos
    const ext = path.extname(data.filename);
    const fileName = `${id}${ext}`;
    const uploadPath = path.join(process.cwd(), 'uploads', fileName);

    await new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(uploadPath);
        data.file.pipe(fileStream);
        data.file.on('end', resolve);
        fileStream.on('error', reject);
    });

    // Guardar en DB
    await pool.query('INSERT INTO files (id, original_name, filename) VALUES ($1, $2, $3)', [id, data.filename, fileName]);

    return { url: `/u/${fileName}` };
});

const start = async () => {
    try {
        await pool.query('CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, original_name TEXT, filename TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
        await fastify.listen({ port: 3000, host: '0.0.0.0' });
    } catch (err) {
        process.exit(1);
    }
};
start();