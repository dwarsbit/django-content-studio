#!/usr/bin/env python
"""
Test wrapper script for Django Content Studio.
Provides convenient test commands and quality gates.
"""
import subprocess
import sys
from pathlib import Path


def run_command(command, description="", cwd=None):
    """Run a shell command and handle errors."""
    print(f"\n{'='*60}")
    if description:
        print(f"🚀 {description}")
    print(f"Running: {' '.join(command)}")
    if cwd:
        print(f"Working directory: {cwd}")
    print('='*60)
    
    result = subprocess.run(command, cwd=cwd)
    
    if result.returncode != 0:
        print(f"\n❌ {description or 'Command'} failed with exit code {result.returncode}")
        sys.exit(result.returncode)
    
    print(f"\n✅ {description or 'Command'} completed successfully")
    return result


def main_test():
    """Run tests normally."""
    run_command(["poetry", "run", "pytest", "tests/"], "Running tests")


def main_test_verbose():
    """Run tests with verbose output."""
    run_command(["poetry", "run", "pytest", "tests/", "-v"], "Running tests (verbose)")


def main_test_cov():
    """Run tests with coverage."""
    run_command(["poetry", "run", "pytest", "tests/", "--cov=content_studio", "--cov-report=term-missing"], 
                "Running tests with coverage")


def main_build():
    """Quality gate: Run tests and build frontend before building."""
    print("\n🔍 Running pre-build quality checks...")
    
    # Run tests first
    run_command(["poetry", "run", "pytest", "tests/", "--tb=short"], "Pre-build tests")
    
    # Build frontend
    print("\n📦 Building frontend...")
    run_command(["npm", "run", "build"], "Frontend build", cwd="frontend")
    
    print("\n✅ All checks passed. Ready to build.")


def main_publish():
    """Quality gate: Run tests before publishing."""
    print("\n🔍 Running pre-publish quality checks...")
    run_command(["poetry", "run", "pytest", "tests/", "--tb=short"], "Pre-publish tests")
    print("\n✅ All checks passed. Ready to publish.")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        if command == "test":
            main_test()
        elif command == "test-verbose":
            main_test_verbose()
        elif command == "test-cov":
            main_test_cov()
        elif command == "build":
            main_build()
        elif command == "publish":
            main_publish()
        else:
            print(f"Unknown command: {command}")
            sys.exit(1)
    else:
        print("Usage: python test_wrapper.py [test|test-verbose|test-cov|build|publish]")
        sys.exit(1)