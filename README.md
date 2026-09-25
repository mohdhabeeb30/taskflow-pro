# TaskFlow Pro

## Overview

TaskFlow Pro is a Kanban board backed by a dependency DAG. Development uses plain HTTP; production HTTPS is provided by the hosting platform.

## Setup

Node 20 is required. Copy `.env.example` to `.env`, fill local values, then run `npm install`.

## Architecture

The server owns persistence, authentication, the dependency engine, and the LLM provider. The client presents the public board and authenticated editing workflows.

## Key Assumptions and Limitations

Dates use ISO calendar dates (`YYYY-MM-DD`). The dependency engine is pure and is tested independently of persistence.

## AI Usage

The server may use Gemini for prerequisite suggestions. API keys remain in environment variables and are never sent to the client.

## Testing

Run `npm test` for unit tests and `npm run typecheck` for the strict TypeScript check.

## Deployment

Production requires a configured secret and environment variables. HTTPS is supplied by the hosting platform.
