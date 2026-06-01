<?php
declare(strict_types=1);

namespace WinsiBot;

class WebhookController
{
    private string $logFile;
    private string $dataDir;
    private string $pythonApiUrl;

    public function __construct()
    {
        $this->logFile      = __DIR__ . '/../../data/webhook_log.json';
        $this->dataDir      = __DIR__ . '/../../data';
        $this->pythonApiUrl = getenv('PYTHON_API_URL') ?: 'http://localhost:5000';

        if (!is_dir($this->dataDir)) {
            mkdir($this->dataDir, 0755, true);
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────
    private function body(): array
    {
        $raw = file_get_contents('php://input');
        return json_decode($raw, true) ?? [];
    }

    private function ok(array $data = []): void
    {
        echo json_encode(['success' => true, 'data' => $data]);
    }

    private function err(string $msg, int $code = 400): void
    {
        http_response_code($code);
        echo json_encode(['success' => false, 'error' => $msg]);
    }

    private function log(string $event, array $data = []): void
    {
        $logs = [];
        if (file_exists($this->logFile)) {
            $logs = json_decode(file_get_contents($this->logFile), true) ?? [];
        }
        $logs[] = [
            'event'     => $event,
            'data'      => $data,
            'timestamp' => date('c'),
            'ip'        => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
        ];
        // mantener solo ultimos 500 logs
        $logs = array_slice($logs, -500);
        file_put_contents($this->logFile, json_encode($logs, JSON_PRETTY_PRINT));
    }

    private function forwardToPython(string $endpoint, array $data): array
    {
        $ch = curl_init($this->pythonApiUrl . $endpoint);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($data),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        ]);
        $response = curl_exec($ch);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($error) return ['success' => false, 'error' => $error];
        return json_decode($response, true) ?? [];
    }

    // ─── Webhooks ─────────────────────────────────────────────────────────────
    public function onMessage(): void
    {
        $body = $this->body();
        if (empty($body)) {
            $this->err('Body vacio');
            return;
        }

        $this->log('message', [
            'jid'      => $body['jid']      ?? '',
            'sender'   => $body['sender']   ?? '',
            'pushName' => $body['pushName'] ?? '',
            'command'  => $body['command']  ?? '',
        ]);

        // reenviar a Python para guardar en Parquet
        $this->forwardToPython('/api/v1/messages', $body);
        $this->ok(['logged' => true]);
    }

    public function onConnected(): void
    {
        $body = $this->body();
        $this->log('connected', [
            'number'   => $body['number']   ?? '',
            'cmdCount' => $body['cmdCount'] ?? 0,
        ]);
        $this->saveStatus('online', $body['number'] ?? '');
        $this->ok();
    }

    public function onDisconnected(): void
    {
        $body = $this->body();
        $this->log('disconnected', ['reason' => $body['reason'] ?? '']);
        $this->saveStatus('offline', '');
        $this->ok();
    }

    public function onCommand(): void
    {
        $body = $this->body();
        $this->log('command', [
            'command' => $body['command'] ?? '',
            'sender'  => $body['sender']  ?? '',
            'success' => $body['success'] ?? true,
        ]);

        $this->forwardToPython('/api/v1/commands/log', $body);
        $this->ok(['logged' => true]);
    }

    // ─── Estado del bot ───────────────────────────────────────────────────────
    private function saveStatus(string $status, string $number): void
    {
        $file = $this->dataDir . '/bot_status.json';
        file_put_contents($file, json_encode([
            'status'    => $status,
            'number'    => $number,
            'updatedAt' => date('c'),
        ]));
    }
}