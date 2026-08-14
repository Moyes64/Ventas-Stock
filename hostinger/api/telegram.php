<?php
/**
 * telegram.php — Envío de notificaciones vía Telegram Bot API
 * Incluir con require_once desde otros scripts de la API.
 * Subir a: public_html/pandorabox/api/telegram.php
 */

// TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_IDS se cargan desde config.local.php (ver
// db.php), nunca se hardcodean acá — antes los chat IDs sí estaban hardcodeados
// en este archivo (ver M6 de la auditoría): quedaban en texto plano en el repo
// (aunque hostinger/ está gitignoreado) y agregar/sacar un socio requería tocar
// código en vez de solo la config del servidor.
if (!defined('TELEGRAM_BOT_TOKEN')) {
    define('TELEGRAM_BOT_TOKEN', getenv('TELEGRAM_BOT_TOKEN') ?: '');
}
if (!defined('TELEGRAM_CHAT_IDS')) {
    define('TELEGRAM_CHAT_IDS', array_filter(array_map('trim', explode(',', getenv('TELEGRAM_CHAT_IDS') ?: ''))));
}

function telegramNotify(string $message): void {
    if (!TELEGRAM_BOT_TOKEN) {
        error_log('[telegram] TELEGRAM_BOT_TOKEN no configurado, se omite el envío');
        return;
    }
    if (!TELEGRAM_CHAT_IDS) {
        error_log('[telegram] TELEGRAM_CHAT_IDS no configurado, se omite el envío');
        return;
    }
    foreach (TELEGRAM_CHAT_IDS as $chatId) {
        $url = 'https://api.telegram.org/bot' . TELEGRAM_BOT_TOKEN . '/sendMessage';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode([
                'chat_id'    => $chatId,
                'text'       => $message,
                'parse_mode' => 'HTML',
            ]),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_TIMEOUT    => 10,
        ]);
        $response  = curl_exec($ch);
        $curlError = curl_error($ch);
        $httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($curlError || $httpCode !== 200) {
            // Antes esto se logueaba igual que un envío exitoso — un HTML mal
            // formado (ver A3) podía hacer que Telegram devuelva 400 y la
            // venta pasara desapercibida sin que nada lo marcara como error.
            error_log('[telegram] FALLÓ el envío — chat_id=' . $chatId . ' http_code=' . $httpCode . ' curl_error=' . $curlError . ' response=' . $response);
        } else {
            error_log('[telegram] chat_id=' . $chatId . ' ok');
        }
    }
}
