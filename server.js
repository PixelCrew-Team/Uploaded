/* YOTSUBA UPLOADED - ENGINE */
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

// Conexión a la DB usando variables de entorno
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: process.env.DB_PORT,
});

// Configuración de subida (Límite 100MB)
fastify.register(multipart, { 
    limits: { fileSize: 100 * 1024 * 1024 } 
});

// Servir Frontend
fastify.register(staticFiles, {
    root: path.join(process.cwd(), 'public'),
    prefix: '/',
});

// Servir Archivos Subidos
fastify.register(staticFiles, {
    root: path.join(process.cwd(), 'uploads'),
    prefix: '/u/',
    decorateReply: false
});

// Ruta de Subida
fastify.post('/upload', async (req, reply) => {
    try {
        const data = await req.file();
        if (!data) return reply.code(400).send({ error: 'No hay archivo' });

        const id = nanoid(8); 
        const ext = path.extname(data.filename);
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
        if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY, 
                original_name TEXT, 
                filename TEXT, 
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' });
        console.log(`🚀 Yotsuba Uploaded activo en puerto ${process.env.PORT || 3000}`);
    } catch (err) {
        process.exit(1);
    }
};
start();