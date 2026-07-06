/// alerts.rs — Notificaciones push vía webhook (formato Discord-compatible).
///
/// Si ALERT_WEBHOOK_URL no está configurado, fire() es un no-op silencioso.
/// Pensado para eventos poco frecuentes (watchdog muerto/recuperado) — no usar
/// para spam de alta frecuencia, no tiene rate-limiting propio.

use std::time::Duration;

use crate::routes::AppState;

pub async fn fire(state: &AppState, message: &str) {
    let Some(url) = &state.alert_webhook_url else { return };

    let body = serde_json::json!({ "content": message });

    let client = reqwest::Client::new();
    let res = client
        .post(url)
        .json(&body)
        .timeout(Duration::from_secs(5))
        .send()
        .await;

    if let Err(e) = res {
        tracing::warn!(error = %e, "alerts: fallo al enviar webhook");
    }
}
