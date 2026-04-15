#!/bin/bash

echo "🚀 Configuración de Yotsuba Uploaded..."

# Datos del Usuario
read -p "🔹 Dominio (ej: upload.yotsuba.giize.com): " DOMAIN
read -p "🔹 Email para SSL: " EMAIL
read -p "🔹 Usuario DB: " DB_USER
read -p "🔹 Clave DB: " DB_PASS
read -p "🔹 Nombre DB: " DB_NAME

# Instalación de Sistema
sudo apt update && sudo apt install -y nodejs npm postgresql postgresql-contrib nginx certbot python3-certbot-nginx

# Configuración PostgreSQL
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;"
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

# Crear .env
cat <<EOF > .env
DB_USER=$DB_USER
DB_HOST=localhost
DB_NAME=$DB_NAME
DB_PASS=$DB_PASS
DB_PORT=5432
PORT=3000
EOF

# Node e Nginx
npm install
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
systemctl restart nginx

# SSL Automático
certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL

echo "✅ Listo. Ejecuta pm2 start server.js"