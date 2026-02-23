# CLAUDE.md — AI Assistant Guide for Claude-News-Automatic-Screening

This file provides context and conventions for AI assistants (Claude Code and similar) working on this repository.

---

## Project Overview

**Claude-News-Automatic-Screening** is a system that leverages the Anthropic Claude API to automatically screen, classify, and summarize news articles. The intended workflow:

1. Ingest news articles from RSS feeds, APIs, or web scraping
2. Send articles through a Claude-powered screening pipeline
3. Classify relevance, sentiment, category, and risk level
4. Summarize key findings and surface actionable items
5. Persist results and optionally deliver via notifications or dashboards

---

## Repository State

This project is in early/bootstrap phase. As of February 2026, only a `README.md` exists. All structure below represents the intended architecture for contributors to build toward.

---

## Intended Directory Structure

```
Claude-News-Automatic-Screening-/
├── CLAUDE.md                  # This file — AI assistant guide
├── README.md                  # Human-readable project overview
├── .env.example               # Required environment variables (no secrets)
├── requirements.txt           # Python dependencies
├── pyproject.toml             # Project metadata and tooling config
│
├── src/
│   └── news_screener/
│       ├── __init__.py
│       ├── main.py            # Entry point / CLI
│       ├── config.py          # Config loading (env vars, settings)
│       ├── fetcher.py         # News ingestion (RSS, APIs, scraping)
│       ├── screener.py        # Claude API screening logic
│       ├── classifier.py      # Category/relevance classification
│       ├── summarizer.py      # Article summarization via Claude
│       └── storage.py         # Persistence layer (DB/file output)
│
├── tests/
│   ├── conftest.py
│   ├── test_fetcher.py
│   ├── test_screener.py
│   ├── test_classifier.py
│   └── test_summarizer.py
│
├── scripts/
│   └── run_pipeline.sh        # Convenience script for running the full pipeline
│
└── data/
    ├── sample_articles.json   # Sample data for local testing
    └── output/                # Screening results (gitignored)
```

---

## Technology Stack

| Layer | Choice |
|---|---|
| Language | Python 3.11+ |
| AI Provider | Anthropic Claude API (`anthropic` SDK) |
| HTTP / Fetching | `httpx` or `requests` + `feedparser` for RSS |
| Storage | SQLite (default) or PostgreSQL via `sqlalchemy` |
| Testing | `pytest` + `pytest-asyncio` |
| Linting | `ruff` |
| Formatting | `black` |
| Type checking | `mypy` |

---

## Environment Variables

All secrets are loaded from environment variables. Never commit `.env` files.

```bash
# .env.example
ANTHROPIC_API_KEY=your_api_key_here

# News sources (comma-separated RSS URLs or API keys)
NEWS_RSS_FEEDS=https://feeds.example.com/rss
NEWS_API_KEY=optional_newsapi_key

# Screening configuration
SCREENING_MODEL=claude-opus-4-6          # Claude model to use
SCREENING_CONCURRENCY=5                  # Parallel API calls
RELEVANCE_THRESHOLD=0.7                  # Min relevance score (0–1)

# Storage
DATABASE_URL=sqlite:///./data/screening.db
```

---

## Development Workflow

### Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY
```

### Running Tests

```bash
pytest tests/ -v
```

### Linting and Formatting

```bash
ruff check src/ tests/
black src/ tests/
mypy src/
```

### Running the Pipeline

```bash
python -m news_screener.main --help
python -m news_screener.main --feed https://feeds.example.com/rss --limit 20
```

---

## Claude API Conventions

### Model Selection

- Use `claude-opus-4-6` for high-accuracy screening tasks
- Use `claude-haiku-4-5` for fast/cheap classification at scale
- Never hardcode model names — always read from `SCREENING_MODEL` env var or config

### Prompt Design

- Keep system prompts in a dedicated `prompts/` directory as `.txt` or `.jinja2` files
- Never embed long prompts inline in Python code
- All prompts must include explicit output format instructions (JSON schema preferred)
- Use structured outputs with `response_model` / `tool_use` for reliable parsing

### Rate Limiting and Concurrency

- Respect Anthropic rate limits; use a semaphore for `SCREENING_CONCURRENCY`
- Implement exponential backoff on `anthropic.RateLimitError`
- Log token usage per request for cost tracking

### Error Handling

- Catch `anthropic.APIError` broadly, then handle subtypes: `RateLimitError`, `APIConnectionError`, `APIStatusError`
- On failure, store the article with `status=failed` and `error_message`, do not crash the pipeline
- Retry transient errors up to 3 times with exponential backoff (2s, 4s, 8s)

---

## Code Conventions

### Python Style

- Python 3.11+ features are allowed (match statements, `tomllib`, etc.)
- Use `dataclasses` or `pydantic` models for data structures, not plain dicts
- Async-first: use `asyncio` and `async/await` for all I/O operations
- Type-annotate all function signatures; `mypy --strict` must pass

### Naming

| Entity | Convention | Example |
|---|---|---|
| Files | `snake_case.py` | `news_fetcher.py` |
| Classes | `PascalCase` | `ArticleScreener` |
| Functions/methods | `snake_case` | `screen_article()` |
| Constants | `UPPER_SNAKE_CASE` | `DEFAULT_MODEL` |
| Pydantic models | `PascalCase` | `ScreeningResult` |

### Module Responsibilities

- `fetcher.py` — only fetches raw article data; no Claude calls
- `screener.py` — orchestrates Claude API calls; no DB access
- `storage.py` — only database read/write; no business logic
- Keep modules focused; cross-cutting concerns go in `utils.py`

### Testing

- All tests use `pytest`; no `unittest.TestCase` style
- Mock all external calls (`anthropic.AsyncAnthropic`, HTTP requests) with `pytest-mock` or `respx`
- Test files mirror `src/` structure: `tests/test_screener.py` for `src/news_screener/screener.py`
- Aim for 80%+ line coverage on `src/`

---

## Git Conventions

### Branch Naming

- Feature branches: `feat/<short-description>`
- Bug fixes: `fix/<short-description>`
- AI-generated branches: `claude/<task-id>` (auto-managed by Claude Code)

### Commit Messages

Use conventional commits:

```
feat(screener): add relevance scoring via Claude tool_use
fix(fetcher): handle malformed RSS entries gracefully
docs: update CLAUDE.md with storage conventions
test(classifier): add edge cases for empty article body
```

### Pull Requests

- All PRs require a description of what was changed and why
- CI must pass before merge (lint, type check, tests)
- Squash-merge to keep `main` history clean

---

## AI Assistant Instructions

When working in this repository as an AI assistant:

1. **Check `.env.example`** before touching environment variables — never add secrets to tracked files
2. **Read existing modules** before adding new code — avoid duplicating functionality
3. **Run `ruff` and `mypy`** mentally before suggesting code — type safety is required
4. **Never make Claude API calls** with hardcoded model names; use config
5. **Prefer `async` patterns** for all new I/O code
6. **Prompt changes** go in `prompts/` directory, not inline in Python
7. **Breaking changes** to `ScreeningResult` data model require migration handling in `storage.py`
8. **Do not commit** `data/output/`, `.env`, or any files containing API keys
9. When adding a new news source adapter, follow the interface defined in `fetcher.py`
10. Prefer small, focused commits over large omnibus changes

---

## Key Contacts and Resources

- [Anthropic Claude API Docs](https://docs.anthropic.com)
- [Anthropic Python SDK](https://github.com/anthropics/anthropic-sdk-python)
- Repository: `namesis2580/Claude-News-Automatic-Screening-`
- Primary branch: `main`
- AI development branch prefix: `claude/`
