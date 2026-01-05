"""
Pytest fixtures for Aether Engine tests.
"""
import pytest
import tempfile
import shutil
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aether_engine import AetherEngine


@pytest.fixture
def temp_project(tmp_path):
    """Create a temporary project directory with sample files."""
    # Create project structure
    src = tmp_path / "src"
    src.mkdir()

    # Sample Python file
    (src / "auth.py").write_text('''
def login(username, password):
    """Authenticate a user."""
    if validate_user(username, password):
        return create_session(username)
    return None

def validate_user(username, password):
    """Validate user credentials."""
    # Check database
    return username == "admin" and password == "secret"

def create_session(username):
    """Create a new session for user."""
    return {"user": username, "token": "abc123"}

def logout(session):
    """End user session."""
    session["token"] = None
    return True

class AuthService:
    def __init__(self):
        self.sessions = {}

    def authenticate(self, username, password):
        """Authenticate via service."""
        result = login(username, password)
        if result:
            self.sessions[username] = result
        return result
'''.strip())

    # Sample TypeScript file
    (src / "api.ts").write_text('''
interface User {
    id: number;
    name: string;
}

function fetchUser(id: number): Promise<User> {
    return fetch(`/api/users/${id}`).then(r => r.json());
}

function updateUser(user: User): Promise<void> {
    return fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify(user)
    }).then(() => {});
}

class UserService {
    private cache: Map<number, User> = new Map();

    async getUser(id: number): Promise<User> {
        if (this.cache.has(id)) {
            return this.cache.get(id)!;
        }
        const user = await fetchUser(id);
        this.cache.set(id, user);
        return user;
    }
}
'''.strip())

    # Sample JavaScript file with references
    (src / "utils.js").write_text('''
function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function parseDate(str) {
    return new Date(str);
}

function isValidDate(date) {
    return date instanceof Date && !isNaN(date);
}

// Usage of formatDate
const today = formatDate(new Date());
const tomorrow = formatDate(parseDate("2024-01-02"));

module.exports = { formatDate, parseDate, isValidDate };
'''.strip())

    return tmp_path


@pytest.fixture
def engine(temp_project):
    """Create an AetherEngine instance for the temp project."""
    eng = AetherEngine(str(temp_project))
    eng.index_project()
    return eng


@pytest.fixture
def indexed_symbols(engine):
    """Get all indexed symbols."""
    # list_symbols returns a list directly, not a dict
    return engine.list_symbols()
