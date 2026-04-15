#!/bin/bash

echo "🚀 Iniciando instalación de Yotsuba Uploaded..."

# 1. Actualizar sistema e instalar dependencias
sudo apt update && sudo apt upgrade -y
sudo apt install -y nodejs npm postgresql postgresql-contrib nginx certbot python3-certbot-nginx

# 2. Configurar PostgreSQL
sudo -u postgres psql -c "CREATE DATABASE yotsuba_db;"
sudo -u postgres psql -c "CREATE USER yotsuba_user WITH PASSWORD 'yotsuba_pass';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE yotsuba_db TO yotsuba_user;"

# 3. Preparar carpetas y dependencias
mkdir -p uploads
npm install fastify @fastify/multipart @fastify/static nanoid pg

# 4. Configurar Nginx (Básico)
echo "Introduce tu dominio (ej: upload.tudominio.com):"
read DOMAIN

cat <<EOF > /etc/nginx/sites-available/yotsuba
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

ln -s /etc/nginx/sites-available/yotsuba /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx

# 5. SSL
certbot --nginx -d $DOMAIN

echo "✅ Instalación completada. Usa 'node server.js' para iniciar."