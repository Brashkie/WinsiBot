<?php
declare(strict_types=1);

namespace WinsiBot;

class Panel
{
    private string $dataDir;
    private string $pythonApiUrl;

    public function __construct()
    {
        $this->dataDir      = __DIR__ . '/../../data';
        $this->pythonApiUrl = getenv('PYTHON_API_URL') ?: 'http://localhost:5000';
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────
    private function ok(array $data): void
    {
        echo json_encode(['success' => true, 'data' => $data]);
    }

    private function err(string $msg, int $code = 500): void
    {
        http_response_code($code);
        echo json_encode(['success' => false, 'error' => $msg]);
    }

    private function fetchPython(string $endpoint): array
    {
        $ch = curl_init($this->pythonApiUrl . $endpoint);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        ]);
        $response = curl_exec($ch);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($error) return [];
        $decoded = json_decode($response, true);
        return $decoded['data'] ?? [];
    }

    private function botStatus(): array
    {
        $file = $this->dataDir . '/bot_status.json';
        if (!file_exists($file)) {
            return ['status' => 'unknown', 'number' => '', 'updatedAt' => ''];
        }
        return json_decode(file_get_contents($file), true) ?? [];
    }

    // ─── Endpoints ────────────────────────────────────────────────────────────
    public function index(): void
    {
        $status = $this->botStatus();
        $this->ok([
            'bot'       => $status,
            'version'   => '8.0.0',
            'timestamp' => date('c'),
        ]);
    }

    public function stats(): void
    {
        $data = $this->fetchPython('/api/v1/stats');
        if (empty($data)) {
            $this->err('No se pudieron obtener estadisticas');
            return;
        }
        $this->ok($data);
    }

    public function users(): void
    {
        $data = $this->fetchPython('/api/v1/users');
        $this->ok([
            'users' => $data,
            'total' => count($data),
        ]);
    }

    public function commands(): void
    {
        $data = $this->fetchPython('/api/v1/stats/top-commands');
        $this->ok([
            'topCommands' => $data,
        ]);
    }
}