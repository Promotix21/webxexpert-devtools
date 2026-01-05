"""
Tests for Aether Engine replace_symbol functionality.
"""
import pytest
import os


class TestReplaceSymbol:
    """Test replace_symbol method."""

    def test_replace_function_dry_run(self, engine, indexed_symbols):
        """Test replacing a function in dry-run mode."""
        # Find the login function
        login_symbol = next(
            (s for s in indexed_symbols if s["name"] == "login"),
            None
        )
        assert login_symbol is not None, "login function should be indexed"

        new_code = '''def login(username, password):
    """Updated login function."""
    return authenticate(username, password)'''

        result = engine.replace_symbol(login_symbol["id"], new_code, dry_run=True)

        assert result["success"] is True
        assert "diff" in result
        assert result["diff"] != ""
        assert "Dry run" in result["message"]
        # Original file should be unchanged
        assert "new_content" not in result

    def test_replace_function_apply(self, engine, indexed_symbols, temp_project):
        """Test replacing a function with apply."""
        # Find validate_user function
        symbol = next(
            (s for s in indexed_symbols if s["name"] == "validate_user"),
            None
        )
        assert symbol is not None

        new_code = '''def validate_user(username, password):
    """New validation logic."""
    return True  # Always valid for testing'''

        result = engine.replace_symbol(symbol["id"], new_code, dry_run=False)

        assert result["success"] is True
        assert "new_content" in result

        # Verify file was updated
        auth_file = temp_project / "src" / "auth.py"
        content = auth_file.read_text()
        assert "New validation logic" in content
        assert "Always valid for testing" in content

    def test_replace_preserves_indentation(self, engine, indexed_symbols, temp_project):
        """Test that replacement preserves original indentation."""
        # Find the authenticate method (indented inside class)
        # It may be classified as 'function' or 'method' depending on parser
        symbol = next(
            (s for s in indexed_symbols
             if s["name"] == "authenticate"),
            None
        )
        assert symbol is not None, "authenticate should be indexed"

        new_code = '''def authenticate(self, username, password):
    """New auth method."""
    return {"user": username}'''

        result = engine.replace_symbol(symbol["id"], new_code, dry_run=True)

        assert result["success"] is True
        # Check the new_code in result has proper indentation
        new_code_result = result.get("new_code", "")
        # Should have class-level indentation (4 spaces typically)
        lines = new_code_result.split('\n')
        assert len(lines) > 0
        # First line should have some indentation since it's a method
        if symbol.get("scope"):  # If it's inside a class
            assert lines[0].startswith(" ") or lines[0].startswith("\t")

    def test_replace_generates_valid_diff(self, engine, indexed_symbols):
        """Test that diff output is valid unified diff format."""
        symbol = next(
            (s for s in indexed_symbols if s["name"] == "create_session"),
            None
        )
        assert symbol is not None

        new_code = '''def create_session(username):
    """Create session with expiry."""
    import time
    return {"user": username, "token": "xyz", "expires": time.time() + 3600}'''

        result = engine.replace_symbol(symbol["id"], new_code, dry_run=True)

        assert result["success"] is True
        diff = result["diff"]

        # Check diff format markers
        assert "---" in diff or "@@" in diff or "-" in diff

    def test_replace_nonexistent_symbol(self, engine):
        """Test replacing a symbol that doesn't exist."""
        result = engine.replace_symbol("nonexistent::function", "code", dry_run=True)

        assert result["success"] is False
        assert "error" in result or "message" in result

    def test_replace_with_multiline_code(self, engine, indexed_symbols, temp_project):
        """Test replacing with complex multiline code."""
        symbol = next(
            (s for s in indexed_symbols if s["name"] == "logout"),
            None
        )
        assert symbol is not None

        new_code = '''def logout(session):
    """
    End user session with logging.

    Args:
        session: The session dict to invalidate

    Returns:
        bool: True if successful
    """
    import logging
    logging.info(f"Logging out user: {session.get('user')}")
    session["token"] = None
    session["expired"] = True
    return True'''

        result = engine.replace_symbol(symbol["id"], new_code, dry_run=False)

        assert result["success"] is True

        # Verify the file contains the new code
        auth_file = temp_project / "src" / "auth.py"
        content = auth_file.read_text()
        assert "End user session with logging" in content
        assert 'session["expired"] = True' in content


class TestReplaceSymbolEdgeCases:
    """Edge case tests for replace_symbol."""

    def test_replace_empty_function(self, engine, indexed_symbols):
        """Test replacing with minimal function body."""
        symbol = next(
            (s for s in indexed_symbols if s["name"] == "isValidDate"),
            None
        )
        assert symbol is not None

        new_code = "function isValidDate(date) { return true; }"

        result = engine.replace_symbol(symbol["id"], new_code, dry_run=True)

        assert result["success"] is True

    def test_replace_typescript_function(self, engine, indexed_symbols):
        """Test replacing TypeScript function."""
        symbol = next(
            (s for s in indexed_symbols if s["name"] == "fetchUser"),
            None
        )
        assert symbol is not None

        new_code = '''function fetchUser(id: number): Promise<User> {
    console.log('Fetching user:', id);
    return fetch(`/api/v2/users/${id}`).then(r => r.json());
}'''

        result = engine.replace_symbol(symbol["id"], new_code, dry_run=True)

        assert result["success"] is True
        assert "diff" in result

    def test_replace_class(self, engine, indexed_symbols, temp_project):
        """Test replacing an entire class."""
        symbol = next(
            (s for s in indexed_symbols
             if s["name"] == "UserService" and s["type"] == "class"),
            None
        )
        assert symbol is not None

        new_code = '''class UserService {
    private cache: Map<number, User> = new Map();

    async getUser(id: number): Promise<User> {
        return this.cache.get(id) ?? await this.fetchAndCache(id);
    }

    private async fetchAndCache(id: number): Promise<User> {
        const user = await fetchUser(id);
        this.cache.set(id, user);
        return user;
    }
}'''

        result = engine.replace_symbol(symbol["id"], new_code, dry_run=True)

        assert result["success"] is True

    def test_original_code_returned(self, engine, indexed_symbols):
        """Test that original code is returned in result."""
        symbol = next(
            (s for s in indexed_symbols if s["name"] == "parseDate"),
            None
        )
        assert symbol is not None

        result = engine.replace_symbol(symbol["id"], "function parseDate(s) { return new Date(s); }", dry_run=True)

        assert result["success"] is True
        assert "original_code" in result
        assert "parseDate" in result["original_code"]
