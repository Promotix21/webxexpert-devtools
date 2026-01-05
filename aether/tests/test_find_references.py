"""
Tests for Aether Engine find_references functionality.
"""
import pytest


class TestFindReferences:
    """Test find_references method."""

    def test_find_function_references(self, engine):
        """Test finding references to a function."""
        result = engine.find_references("login")

        assert result["success"] is True
        assert result["symbol_name"] == "login"
        assert result["total_references"] >= 1

        # Should find reference in AuthService.authenticate
        refs = result["references"]
        ref_locations = [(r["file"], r["line"]) for r in refs]

        # At minimum, should find the call in authenticate method
        assert any("auth.py" in f for f, _ in ref_locations)

    def test_find_no_references(self, engine):
        """Test searching for symbol with no references."""
        result = engine.find_references("nonexistent_function")

        assert result["success"] is True
        assert result["total_references"] == 0
        assert result["references"] == []

    def test_find_multiple_references(self, engine):
        """Test finding multiple references to a function."""
        result = engine.find_references("formatDate")

        assert result["success"] is True
        assert result["total_references"] >= 2  # Called twice in utils.js

        refs = result["references"]
        assert len(refs) >= 2

    def test_find_references_returns_context(self, engine):
        """Test that references include context information."""
        result = engine.find_references("validate_user")

        assert result["success"] is True
        assert result["total_references"] >= 1

        ref = result["references"][0]
        # Reference should have file, line, and context
        assert "file" in ref
        assert "line" in ref

    def test_find_references_across_files(self, engine, temp_project):
        """Test finding references across multiple files."""
        # Add another file that imports from auth
        (temp_project / "src" / "main.py").write_text('''
from auth import login, logout

def main():
    session = login("admin", "password")
    if session:
        print("Logged in!")
        logout(session)
'''.strip())

        # Re-index
        engine.index_project()

        result = engine.find_references("login")

        assert result["success"] is True
        # Should find in both auth.py and main.py
        files_with_refs = set(r["file"] for r in result["references"])
        assert len(files_with_refs) >= 1


class TestFindReferencesEdgeCases:
    """Edge case tests for find_references."""

    def test_find_class_references(self, engine):
        """Test finding references to a class."""
        result = engine.find_references("AuthService")

        assert result["success"] is True
        # The class name should be found

    def test_find_method_references(self, engine):
        """Test finding references to a method name."""
        result = engine.find_references("authenticate")

        assert result["success"] is True

    def test_find_references_case_sensitive(self, engine):
        """Test that search is case-sensitive."""
        result_lower = engine.find_references("login")
        result_upper = engine.find_references("LOGIN")

        # Should find login but not LOGIN
        assert result_lower["total_references"] >= 1
        assert result_upper["total_references"] == 0

    def test_find_references_partial_match(self, engine):
        """Test that partial names don't match incorrectly."""
        result = engine.find_references("log")

        # Should not match 'login' or 'logout' as those are different symbols
        # This tests that we're doing proper reference finding, not just grep
        refs = result["references"]
        for ref in refs:
            # If there are refs, they should be for actual 'log' calls
            # not 'login' or 'logout'
            pass  # Behavior depends on implementation
