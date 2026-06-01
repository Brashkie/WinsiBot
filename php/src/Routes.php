<?php
declare(strict_types=1);

namespace WinsiBot;

class Routes
{
    private WebhookController $webhook;
    private Panel $panel;

    public function __construct()
    {
        $this->webhook = new WebhookController();
        $this->panel   = new Panel();
    }

    public function dispatch(string $method, string $uri): void
    {
        $path = parse_url($uri, PHP_URL_PATH);
        $path = rtrim($path, '/');

        // servir archivos estáticos
        $staticFile = __DIR__ . '/../../public' . $path;
        if ($path !== '/' && file_exists($staticFile) && is_file($staticFile)) {
            $this->serveStatic($staticFile);
            return;
        }

        match (true) {
            // ─── Panel HTML ───────────────────────────────────────────────
            ($method === 'GET' && ($path === '' || $path === '/'))
                => $this->servePanel(),

            $method === 'GET' && $path === '/panel.html'
                => $this->servePanel(),

            // ─── Webhooks ─────────────────────────────────────────────────
            $method === 'POST' && $path === '/webhook/message'
                => $this->webhook->onMessage(),

            $method === 'POST' && $path === '/webhook/connected'
                => $this->webhook->onConnected(),

            $method === 'POST' && $path === '/webhook/disconnected'
                => $this->webhook->onDisconnected(),

            $method === 'POST' && $path === '/webhook/command'
                => $this->webhook->onCommand(),

            // ─── Panel API ────────────────────────────────────────────────
            $method === 'GET' && $path === '/panel'
                => $this->panel->index(),

            $method === 'GET' && $path === '/panel/stats'
                => $this->panel->stats(),

            $method === 'GET' && $path === '/panel/users'
                => $this->panel->users(),

            $method === 'GET' && $path === '/panel/commands'
                => $this->panel->commands(),

            // ─── Health ───────────────────────────────────────────────────
            $method === 'GET' && $path === '/health'
                => $this->ok(['status' => 'online', 'version' => '1.0.0']),

            default => $this->notFound(),
        };
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────
    private function servePanel(): void
    {
        $file = __DIR__ . '/../../public/panel.html';
        if (!file_exists($file)) {
            $this->notFound();
            return;
        }
        header('Content-Type: text/html; charset=utf-8');
        readfile($file);
    }

    private function serveStatic(string $filePath): void
    {
        $ext = pathinfo($filePath, PATHINFO_EXTENSION);
        $mime = match ($ext) {
            'html'  => 'text/html; charset=utf-8',
            'css'   => 'text/css',
            'js'    => 'application/javascript',
            'json'  => 'application/json',
            'png'   => 'image/png',
            'jpg',
            'jpeg'  => 'image/jpeg',
            'svg'   => 'image/svg+xml',
            'ico'   => 'image/x-icon',
            default => 'application/octet-stream',
        };
        header('Content-Type: ' . $mime);
        readfile($filePath);
    }

    private function ok(array $data): void
    {
        header('Content-Type: application/json');
        echo json_encode(['success' => true, 'data' => $data]);
    }

    private function notFound(): void
    {
        header('Content-Type: application/json');
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Ruta no encontrada']);
    }
}