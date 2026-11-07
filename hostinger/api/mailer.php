<?php
/**
 * mailer.php — Envío de mails por SMTP (sin dependencias externas)
 * Incluir con require_once desde otros scripts de la API.
 * Subir a: public_html/pandorabox/api/mailer.php
 *
 * Cliente SMTP mínimo sobre SSL (puerto 465, como smtp.hostinger.com). No se
 * usa mail() de PHP: sale sin autenticar y suele terminar en spam.
 * Los datos se cargan desde config.local.php (ver config.local.example.php).
 */

if (!defined('SMTP_HOST'))      define('SMTP_HOST', getenv('SMTP_HOST') ?: 'smtp.hostinger.com');
if (!defined('SMTP_PORT'))      define('SMTP_PORT', (int)(getenv('SMTP_PORT') ?: 465));
if (!defined('SMTP_USER'))      define('SMTP_USER', getenv('SMTP_USER') ?: '');
if (!defined('SMTP_PASS'))      define('SMTP_PASS', getenv('SMTP_PASS') ?: '');
if (!defined('SMTP_FROM_NAME')) define('SMTP_FROM_NAME', getenv('SMTP_FROM_NAME') ?: 'Pandora Box - Juegos de Ingenio');
// Copia oculta de todo mail al cliente (y dirección de respuesta).
if (!defined('MAIL_BCC'))       define('MAIL_BCC', getenv('MAIL_BCC') ?: 'ventas@pandorabox-juegosdeingenio.com.ar');

/**
 * Manda un mail HTML. Devuelve null si salió bien, o el texto del error.
 * Nunca tira excepción: quien llama decide qué hacer con el error.
 */
function sendMail(string $to, string $subject, string $html): ?string {
    if (!SMTP_USER || !SMTP_PASS) return 'SMTP_USER / SMTP_PASS no configurados';
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return 'Email del cliente inválido: ' . $to;

    $bcc = (MAIL_BCC && strcasecmp(MAIL_BCC, $to) !== 0) ? MAIL_BCC : null;

    $fp = @stream_socket_client('ssl://' . SMTP_HOST . ':' . SMTP_PORT, $errno, $errstr, 15);
    if (!$fp) return "No se pudo conectar a SMTP: {$errstr} ({$errno})";
    stream_set_timeout($fp, 15);

    // Lee una respuesta (puede ser multilínea: "250-..." hasta "250 ...").
    $read = function () use ($fp): string {
        $resp = '';
        while (($line = fgets($fp, 1024)) !== false) {
            $resp .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') break;
        }
        return $resp;
    };
    $cmd = function (?string $line, int $expect) use ($fp, $read): void {
        if ($line !== null) fwrite($fp, $line . "\r\n");
        $resp = $read();
        if ((int)substr($resp, 0, 3) !== $expect) {
            // No mostrar la contraseña en el error (AUTH manda base64).
            throw new Exception('SMTP respondió: ' . trim($resp));
        }
    };

    try {
        $cmd(null, 220);
        $cmd('EHLO pandorabox-juegosdeingenio.com.ar', 250);
        $cmd('AUTH LOGIN', 334);
        $cmd(base64_encode(SMTP_USER), 334);
        $cmd(base64_encode(SMTP_PASS), 235);
        $cmd('MAIL FROM:<' . SMTP_USER . '>', 250);
        $cmd('RCPT TO:<' . $to . '>', 250);
        if ($bcc) $cmd('RCPT TO:<' . $bcc . '>', 250);
        $cmd('DATA', 354);

        $encodedName = '=?UTF-8?B?' . base64_encode(SMTP_FROM_NAME) . '?=';
        $headers = [
            'Date: ' . date('r'),
            'From: ' . $encodedName . ' <' . SMTP_USER . '>',
            'To: <' . $to . '>',
            'Reply-To: <' . (MAIL_BCC ?: SMTP_USER) . '>',
            'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@pandorabox-juegosdeingenio.com.ar>',
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
        ];
        // La copia oculta va solo como RCPT TO, nunca como header (si no, deja de ser oculta).
        $body = chunk_split(base64_encode($html));
        $cmd(implode("\r\n", $headers) . "\r\n\r\n" . $body . "\r\n.", 250);
        fwrite($fp, "QUIT\r\n");
        fclose($fp);
        return null;
    } catch (Exception $e) {
        @fwrite($fp, "QUIT\r\n");
        @fclose($fp);
        return $e->getMessage();
    }
}
