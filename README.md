docker compose run --rm certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  -d qassistant.example.com \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email \
  --force-renewal