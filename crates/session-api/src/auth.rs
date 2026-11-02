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

/// Si `provided` es la clave, en un tiempo que depende solo de la clave real.
///
/// Hasta la 9.3 salía antes si los largos eran distintos: midiendo cuánto
/// tardaba, se podía averiguar el largo de la clave. Ahora siempre se recorre
/// la clave entera —que es fija— y la diferencia de largos entra en la misma
/// cuenta, sin un `if`.
fn constant_time_eq(provided: &str, expected: &str) -> bool {
    let (a, b) = (provided.as_bytes(), expected.as_bytes());
    let mut diferencia = (a.len() ^ b.len()) as u64;
    for (i, &y) in b.iter().enumerate() {
        let x = a.get(i).copied().unwrap_or(0);
        diferencia |= u64::from(x ^ y);
    }
    diferencia == 0
}

#[cfg(test)]
mod tests {
    use super::constant_time_eq;

    #[test]
    fn compara_bien_con_cualquier_largo() {
        let clave = "0123456789abcdef0123456789abcdef";
        assert!(constant_time_eq(clave, clave));
        for otra in [
            "",
            "0",
            "0123456789abcdef0123456789abcde",
            "0123456789abcdef0123456789abcdeF",
            "0123456789abcdef0123456789abcdef0",
            "x",
        ] {
            assert!(!constant_time_eq(otra, clave), "{otra:?}");
        }
        // Un prefijo de la clave con ceros al final no la iguala.
        let mut con_ceros = clave[..16].to_string();
        con_ceros.push_str(&"\0".repeat(16));
        assert!(!constant_time_eq(&con_ceros, clave));
        assert!(!constant_time_eq(clave, ""));
    }
}
