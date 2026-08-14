<?php
/**
 * config.local.example.php — Plantilla, sin secretos reales.
 *
 * Copiá este archivo como config.local.php (mismo directorio) y completá los
 * valores reales. config.local.php nunca se versiona ni se comparte.
 */

putenv('DB_HOST=localhost');
putenv('DB_NAME=tu_nombre_de_base');
putenv('DB_USER=tu_usuario_mysql');
putenv('DB_PASS=tu_password_mysql');
putenv('SYNC_API_KEY=una_clave_larga_y_aleatoria_min_20_caracteres');
putenv('MP_ACCESS_TOKEN=tu_access_token_de_mercadopago');
// Opcional (ver hallazgo M3 de la auditoría): panel de MP > Tus integraciones
// > la app > Webhooks > "Firma secreta". Sin esto, webhook.php sigue
// funcionando pero no puede validar que la notificación venga realmente de MP.
putenv('MP_WEBHOOK_SECRET=la_firma_secreta_del_panel_de_webhooks_de_mp');
putenv('DASHBOARD_PASSWORD=una_password_para_el_dashboard');
putenv('TELEGRAM_BOT_TOKEN=tu_token_de_bot_de_telegram');
// Chat IDs que reciben las notificaciones de venta (separados por coma si son varios).
putenv('TELEGRAM_CHAT_IDS=tu_chat_id,otro_chat_id');
