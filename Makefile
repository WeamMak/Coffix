UV ?= uv
PNPM ?= corepack pnpm
COMPOSE ?= docker compose
UV_CACHE_DIR ?= $(CURDIR)/.local/uv-cache

.DEFAULT_GOAL := help

.PHONY: help bootstrap services test lint dev

help:
	@echo "Coffix development commands:"
	@echo "  make bootstrap  Install locked Python and JavaScript dependencies"
	@echo "  make services   Start local PostgreSQL and Redis"
	@echo "  make test       Run workspace tests"
	@echo "  make lint       Run lint and type checks"
	@echo "  make dev        Start the current local development runtime"

bootstrap:
	bash scripts/check-local-tooling.sh
	UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) sync --project backend --frozen
	$(PNPM) install --frozen-lockfile

services:
	$(COMPOSE) up -d --wait postgres redis

test:
	UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run --project backend pytest backend/tests -q
	$(PNPM) --recursive --if-present test

lint:
	UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run --project backend ruff check backend
	UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run --project backend ty check backend/src backend/tests backend/migrations
	$(PNPM) --recursive --if-present lint
	$(PNPM) --recursive --if-present typecheck

dev: services
	UV_CACHE_DIR=$(UV_CACHE_DIR) $(UV) run --project backend fastapi dev backend/src/coffix/api/app.py --reload-dir backend/src
