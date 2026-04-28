docker compose run --rm certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  -d qassistant.alacritycore.com \
  --email steve@alacritycore.com \
  --agree-tos \
  --no-eff-email \
  --force-renewal