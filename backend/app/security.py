import hashlib
import re
import secrets
import threading
import time
from collections import defaultdict, deque

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

# Argon2id with the library's recommended (RFC 9106 low-memory) parameters.
_hasher = PasswordHasher()

# Computed once so failed logins for unknown usernames take as long as real ones.
_DUMMY_HASH = _hasher.hash("medslot-timing-equaliser")

USERNAME_RE = re.compile(r"^[a-z0-9_.]{3,30}$")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def password_problems(password: str) -> list[str]:
    problems = []
    if len(password) < 8:
        problems.append("at least 8 characters")
    if len(password) > 128:
        problems.append("at most 128 characters")
    if not re.search(r"[A-Za-z]", password):
        problems.append("a letter")
    if not re.search(r"\d", password):
        problems.append("a number")
    return problems


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


_REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I


def new_booking_reference() -> str:
    return "MS-" + "".join(secrets.choice(_REFERENCE_ALPHABET) for _ in range(6))


class LoginThrottle:
    """In-memory sliding window of failed logins per key.

    Per-process only; good enough for a single instance. A multi-instance
    deployment would move this to Redis or the database.
    """

    def __init__(self) -> None:
        self._failures: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: str, window: float) -> deque[float]:
        q = self._failures[key]
        cutoff = time.monotonic() - window
        while q and q[0] < cutoff:
            q.popleft()
        return q

    def is_blocked(self, key: str, max_failures: int, window_seconds: float) -> bool:
        with self._lock:
            return len(self._prune(key, window_seconds)) >= max_failures

    def record_failure(self, key: str) -> None:
        with self._lock:
            self._failures[key].append(time.monotonic())

    def reset(self, key: str | None = None) -> None:
        with self._lock:
            if key is None:
                self._failures.clear()
            else:
                self._failures.pop(key, None)


login_throttle = LoginThrottle()
