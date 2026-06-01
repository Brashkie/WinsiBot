use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::{Json, Response},
};

pub async fn require_api_key(
    axum::extract::State(api_key): axum::extract::State<String>,
    request: Request,
    next: Next,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    let provided = request
        .headers()
        .get("x-api-key")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if !constant_time_eq(provided, &api_key) {
        tracing::warn!(
            ip = ?request.headers().get("x-forwarded-for"),
            "Intento con API key inválida"
        );
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "ok": false, "error": "API key inválida o faltante" })),
        ));
    }

    Ok(next.run(request).await)
}

fn constant_time_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() { return false; }
    a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}
