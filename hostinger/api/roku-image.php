<?php
/**
 * roku-image.php — Versión JPG achicada de una imagen de producto, para la
 * app Roku de la vidriera (jpgUrl de roku.php).
 *
 * GET /api/roku-image.php?f=289/img_0.webp
 *
 * Convierte WebP/PNG a JPG y achica a 1000px de lado máximo. El resultado se
 * guarda en images/roku-cache/ y se regenera solo si la original cambia.
 *
 * Subir a: public_html/pandorabox/api/roku-image.php
 */

require_once __DIR__ . '/db.php';

const ROKU_MAX_SIDE = 1000;

$rel  = $_GET['f'] ?? '';
$base = realpath(IMAGES_BASE_PATH);
$src  = $base ? realpath(IMAGES_BASE_PATH . '/' . $rel) : false;

// realpath + prefijo: evita que ?f=../../api/config.local.php lea fuera de images/products
if (!$src || strpos($src, $base . DIRECTORY_SEPARATOR) !== 0 || !is_file($src)) {
    http_response_code(404); exit;
}

$cacheDir  = dirname(IMAGES_BASE_PATH) . '/roku-cache';
$cacheFile = $cacheDir . '/' . md5($rel) . '.jpg';

if (!is_file($cacheFile) || filemtime($cacheFile) < filemtime($src)) {
    $img = @imagecreatefromstring(file_get_contents($src));
    if (!$img) { http_response_code(415); exit; }

    $w = imagesx($img);
    $h = imagesy($img);
    $scale = min(1, ROKU_MAX_SIDE / max($w, $h));
    $nw = max(1, (int)round($w * $scale));
    $nh = max(1, (int)round($h * $scale));

    // Fondo blanco: las PNG/WebP con transparencia quedarían negras en JPG
    $out = imagecreatetruecolor($nw, $nh);
    imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
    imagecopyresampled($out, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);

    if (!is_dir($cacheDir)) @mkdir($cacheDir, 0755, true);
    imagejpeg($out, $cacheFile, 85);
    imagedestroy($img);
    imagedestroy($out);
}

header('Content-Type: image/jpeg');
header('Content-Length: ' . filesize($cacheFile));
header('Cache-Control: public, max-age=86400');
readfile($cacheFile);
