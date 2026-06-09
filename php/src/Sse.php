<?php
declare(strict_types=1);

namespace WinsiBot;

// ─────────────────────────────────────────────────────────────────────────────
//  GET /events — Server-Sent Events stream
//
//  El browser conecta una sola vez y recibe pushes cuando:
//    • cambia bot_status.json      → emite 'status'
//    • hay entradas nuevas en log  → emite 'message'|'command'|'connected'|…
//    • cada ~10 s                  → emite 'stats', 'commands'
//    • cada ~30 s                  → emite 'users'
//    • cada 20 s                   → heartbeat (: ping)
// ─────────────────────────────────────────────────────────────────────────────

class Sse
{
    private string $dataDir;
    private string $pythonApi;
    private string $logFile;
    private string $statusFile;

    public function __construct()
    {
        $this->dataDir    = __DIR__ . '/../../data';
        $this->pythonApi  = getenv('PYTHON_API_URL') ?: 'http://localhost:5000';
        $this->logFile    = $this->dataDir . '/webhook_log.json';
        $this->statusFile = $this->dataDir . '/bot_status.json';
    }

    public function stream(): void
    {
        // Disable all output buffering
        @ini_set('output_buffering', 'off');
        @ini_set('zlib.output_compression', '0');
        while (ob_get_level() > 0) { ob_end_clean(); }

        // SSE headers — must come before any output
        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache, no-store');
        header('Connection: keep-alive');
        header('X-Accel-Buffering: no');
        header('Access-Control-Allow-Origin: *');

        // Allow client to resume from last seen event id
        $resumeId = (int)($_SERVER['HTTP_LAST_EVENT_ID'] ?? 0);

        // Initial state
        $lastLogMtime    = 0;
        $lastStatusMtime = 0;
        $lastStatsFetch  = 0;
        $lastUsersFetch  = 0;
        $lastHeartbeat   = 0;
        $logBaseline     = $resumeId; // entries seen so far
        $eventId         = $resumeId;

        // ─── Loop ────────────────────────────────────────────────────────────
        while (true) {
            if (connection_aborted()) break;

            $now  = time();

            // ── Bot status ────────────────────────────────────────────────────
            $sMtime = file_exists($this->statusFile) ? (int)filemtime($this->statusFile) : 0;
            if ($sMtime > $lastStatusMtime) {
                $lastStatusMtime = $sMtime;
                $s = json_decode(@file_get_contents($this->statusFile) ?: '{}', true) ?? [];
                $this->emit($eventId++, 'status', [
                    'online'  => ($s['status'] ?? 'offline') === 'online',
                    'number'  => $s['number']    ?? '',
                    'ts'      => $s['updatedAt'] ?? date('c'),
                ]);
            }

            // ── Webhook log — new entries ──────────────────────────────────
            $lMtime = file_exists($this->logFile) ? (int)filemtime($this->logFile) : 0;
            if ($lMtime > $lastLogMtime) {
                $lastLogMtime = $lMtime;
                $raw = @file_get_contents($this->logFile);
                if ($raw) {
                    $entries = json_decode($raw, true) ?? [];
                    $total   = count($entries);

                    // Initialize baseline on first read
                    if ($logBaseline === 0 && $resumeId === 0) {
                        $logBaseline = $total; // skip existing, only new
                    }

                    // Emit entries newer than baseline
                    for ($i = $logBaseline; $i < $total; $i++) {
                        $entry = $entries[$i];
                        $type  = $entry['event'] ?? 'message';
                        $data  = $entry['data']  ?? [];
                        $data['ts'] = $entry['timestamp'] ?? date('c');
                        $this->emit($eventId++, $type, $data);
                    }
                    $logBaseline = $total;
                }
            }

            // ── Stats + commands (every 10 s) ─────────────────────────────
            if ($now - $lastStatsFetch >= 10) {
                $lastStatsFetch = $now;

                $stats = $this->fetchPython('/api/v1/stats');
                if ($stats) $this->emit($eventId++, 'stats', $stats);

                $cmds = $this->fetchPython('/api/v1/commands/top');
                if ($cmds) $this->emit($eventId++, 'commands', is_array($cmds) ? $cmds : []);
            }

            // ── Users (every 30 s) ────────────────────────────────────────
            if ($now - $lastUsersFetch >= 30) {
                $lastUsersFetch = $now;
                $users = $this->fetchPython('/api/v1/users');
                if ($users) $this->emit($eventId++, 'users', is_array($users) ? $users : []);
            }

            // ── Heartbeat (every 20 s) ────────────────────────────────────
            if ($now - $lastHeartbeat >= 20) {
                $lastHeartbeat = $now;
                echo ": ping\n\n";
                $this->flush();
            }

            sleep(2);
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private function emit(int $id, string $event, array $data): void
    {
        echo "id: {$id}\n";
        echo "event: {$event}\n";
        echo "data: " . json_encode($data, JSON_UNESCAPED_UNICODE) . "\n\n";
        $this->flush();
    }

    private function flush(): void
    {
        flush();
    }

    private function fetchPython(string $endpoint): array|null
    {
        if (!function_exists('curl_init')) return null;

        $ch = curl_init($this->pythonApi . $endpoint);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 4,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_HTTPHEADER     => ['Accept: application/json'],
        ]);
        $body   = (string)curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($status === 200 && $body !== '') {
            $decoded = json_decode($body, true);
            return $decoded['data'] ?? $decoded ?? null;
        }
        return null;
    }
}
