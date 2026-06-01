import os
import hashlib
import hmac
from functools import wraps
from flask import request, jsonify, current_app
from datetime import datetime, timedelta
import jwt

SECRET_KEY = os.getenv('API_SECRET_KEY', 'winsibot-secret-dev')
JWT_EXPIRY  = int(os.getenv('JWT_EXPIRY_HOURS', '24'))

# ─── Helpers ──────────────────────────────────────────────────────────────────
def generate_token(payload: dict) -> str:
    payload['exp'] = datetime.utcnow() + timedelta(hours=JWT_EXPIRY)
    payload['iat'] = datetime.utcnow()
    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')

def verify_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()

def verify_hmac(data: str, signature: str) -> bool:
    expected = hmac.new(
        SECRET_KEY.encode(),
        data.encode(),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)

# ─── API Keys permitidas ──────────────────────────────────────────────────────
# En produccion, cargar desde DB o env
ALLOWED_KEYS: set[str] = {
    hash_key(os.getenv('BOT_API_KEY', 'winsibot-internal-key')),
}

def init_auth(app):
    """Inicializa auth en la app Flask"""
    app.config['SECRET_KEY']  = SECRET_KEY
    app.config['JWT_EXPIRY']  = JWT_EXPIRY

# ─── Decoradores ──────────────────────────────────────────────────────────────
def require_api_key(f):
    """Valida API key en header X-API-Key"""
    @wraps(f)
    def decorated(*args, **kwargs):
        key = request.headers.get('X-API-Key')
        if not key:
            return jsonify({'success': False, 'error': 'API key requerida'}), 401
        if hash_key(key) not in ALLOWED_KEYS:
            return jsonify({'success': False, 'error': 'API key invalida'}), 403
        return f(*args, **kwargs)
    return decorated

def require_jwt(f):
    """Valida JWT en header Authorization: Bearer <token>"""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return jsonify({'success': False, 'error': 'Token requerido'}), 401
        token   = auth.split(' ', 1)[1]
        payload = verify_token(token)
        if not payload:
            return jsonify({'success': False, 'error': 'Token invalido o expirado'}), 403
        request.jwt_payload = payload
        return f(*args, **kwargs)
    return decorated

def require_internal(f):
    """
    Valida que la request venga del bot Node (localhost).
    Para endpoints internos que no necesitan key publica.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        remote = request.remote_addr
        if remote not in ('127.0.0.1', '::1', 'localhost'):
            return jsonify({'success': False, 'error': 'Acceso solo interno'}), 403
        return f(*args, **kwargs)
    return decorated

# ─── Endpoint de login ────────────────────────────────────────────────────────
def register_auth_routes(app):
    @app.route('/api/v1/auth/token', methods=['POST'])
    def get_token():
        body = request.get_json()
        key  = body.get('api_key', '')
        if hash_key(key) not in ALLOWED_KEYS:
            return jsonify({'success': False, 'error': 'Credenciales invalidas'}), 403
        token = generate_token({'client': 'winsibot', 'role': 'bot'})
        return jsonify({'success': True, 'data': {'token': token, 'expires_in': JWT_EXPIRY * 3600}})