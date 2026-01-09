# Authensor Makefile
# Convenience commands for development

PNPM ?= corepack pnpm

.PHONY: help install dev build test clean docker-up docker-down gen check

# Default target
help:
	@echo "Authensor Development Commands"
	@echo ""
	@echo "  make install     Install all dependencies"
	@echo "  make dev         Start development servers"
	@echo "  make build       Build all packages"
	@echo "  make test        Run all tests"
	@echo "  make gen         Generate types from schemas"
	@echo "  make check       Run type checking and linting"
	@echo "  make docker-up   Start Docker services (postgres)"
	@echo "  make docker-down Stop Docker services"
	@echo "  make clean       Clean all build artifacts"
	@echo ""
	@echo "Quick Start:"
	@echo "  make install && make docker-up && make dev"

# Install all dependencies
install:
	$(PNPM) install
	cd packages/sdk-py && ( [ -x .venv/bin/python ] || python3 -m venv .venv ) && .venv/bin/pip install -e '.[dev]'

# Start development servers
dev:
	$(PNPM) dev

# Build all packages
build:
	$(PNPM) build

# Run all tests
test:
	$(PNPM) test
	cd packages/sdk-py && ( [ -x .venv/bin/python ] && .venv/bin/python -m pytest || (command -v uv >/dev/null && uv run pytest) || python -m pytest)

# Generate types from schemas
gen:
	$(PNPM) gen

# Check types and lint
check:
	$(PNPM) typecheck
	$(PNPM) lint
	cd packages/sdk-py && ( [ -x .venv/bin/python ] && .venv/bin/python -m mypy authensor || (command -v uv >/dev/null && uv run mypy authensor) || python -m mypy authensor)
	cd packages/sdk-py && ( [ -x .venv/bin/python ] && .venv/bin/python -m ruff check authensor || (command -v uv >/dev/null && uv run ruff check authensor) || python -m ruff check authensor)

# Start Docker services
docker-up:
	docker compose up -d postgres
	@echo "Waiting for services to be healthy..."
	@sleep 3
	@echo "Services started!"

# Stop Docker services
docker-down:
	docker compose down

# Start full stack (Docker + dev servers)
up: docker-up dev

# Clean all build artifacts
clean:
	$(PNPM) clean
	rm -rf node_modules
	rm -rf packages/*/node_modules
	rm -rf packages/*/dist
	rm -rf packages/sdk-py/.venv
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true

# Format all code
format:
	$(PNPM) format
	cd packages/sdk-py && ( [ -x .venv/bin/python ] && .venv/bin/python -m ruff format authensor || (command -v uv >/dev/null && uv run ruff format authensor) || python -m ruff format authensor)

# Run quickstart examples
quickstart-node:
	$(PNPM) --filter @authensor/example-node-quickstart start

quickstart-python:
	packages/sdk-py/.venv/bin/python examples/python-quickstart/main.py
