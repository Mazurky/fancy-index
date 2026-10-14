<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function isProtectedPath(string $path): bool
{
    return preg_match('{(?:^|/)\.[^/]*|(?:\.(?:bak|backup|old|orig|save|swp|tmp)|~)$|(?:^|/)#[^/]*#$}iD', $path) === 1;
}

$root = realpath($_SERVER['DOCUMENT_ROOT'] ?? dirname(__DIR__, 3));
$referer = $_SERVER['HTTP_REFERER'] ?? '';
$requestedFile = $_GET['file'] ?? '';
$serverHost = preg_replace('/:\d+$/', '', (string) ($_SERVER['HTTP_HOST'] ?? ''));
$refererParts = is_string($referer) ? parse_url($referer) : false;

if ($root === false || !is_array($refererParts) || ($refererParts['host'] ?? '') !== $serverHost) {
    respond(403, ['error' => 'Directory context required']);
}

if (!is_string($requestedFile) || $requestedFile === '') {
    respond(400, ['error' => 'File name required']);
}

if ($requestedFile === '.' || $requestedFile === '..' || strpbrk($requestedFile, '/' . chr(92) . chr(0)) !== false) {
    respond(400, ['error' => 'Invalid file name']);
}
if (isProtectedPath($requestedFile)) {
    respond(403, ['error' => 'Protected file']);
}

$refererPath = $refererParts['path'] ?? '/';
$lastSlash = strrpos($refererPath, '/');
$directoryPath = $lastSlash === false ? '/' : substr($refererPath, 0, $lastSlash + 1);
$directoryPath = rawurldecode($directoryPath);
if (strpos($directoryPath, chr(0)) !== false) {
    respond(400, ['error' => 'Invalid directory']);
}
if (isProtectedPath($directoryPath)) {
    respond(403, ['error' => 'Protected directory']);
}
$directory = realpath($root . DIRECTORY_SEPARATOR . ltrim($directoryPath, '/'));
$rootPrefix = rtrim($root, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;

if ($directory === false || !is_dir($directory) || ($directory !== $root && strpos($directory, $rootPrefix) !== 0)) {
    respond(403, ['error' => 'Invalid directory']);
}
if ($directory !== $root && isProtectedPath(substr($directory, strlen($rootPrefix)))) {
    respond(403, ['error' => 'Protected directory']);
}

$fullPath = realpath($directory . DIRECTORY_SEPARATOR . $requestedFile);
if ($fullPath === false || dirname($fullPath) !== $directory || !is_file($fullPath)) {
    respond(404, ['error' => 'File not found']);
}
if (isProtectedPath(substr($fullPath, strlen($rootPrefix)))) {
    respond(403, ['error' => 'Protected file']);
}

$fileStat = @stat($fullPath);
if ($fileStat === false || !isset($fileStat['size'], $fileStat['blocks'])) {
    respond(500, ['error' => 'Unable to read file size']);
}

$totalBytes = max(0, (int) $fileStat['size']);
$allocatedBytes = max(0, (int) $fileStat['blocks'] * 512);

respond(200, [
    'size' => $totalBytes,
    'allocated' => min($allocatedBytes, $totalBytes),
]);
