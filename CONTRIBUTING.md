# Contributing to Excalidraw MCP Server

Thank you for your interest in contributing to the Excalidraw MCP Server project!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/excalidraw-mcp.git`
3. Add the upstream remote: `git remote add upstream https://github.com/whallysson/excalidraw-mcp.git`
4. Create a feature branch: `git checkout -b feature/your-feature-name`
5. Make your changes
6. Run tests: `npm test`
7. Commit your changes: `git commit -am 'Add new feature'`
8. Push to your fork: `git push origin feature/your-feature-name`
9. Create a Pull Request to `whallysson/excalidraw-mcp`

## Development Setup

See the [README.md](./README.md) for installation instructions.

Quick start:
```bash
npm install
cd backend && npm install
cd ../frontend && npm install
npm run dev:all
```

## Code Style

- Use TypeScript for all code
- Follow existing code formatting
- Write meaningful commit messages
- Add tests for new features
- Update documentation when needed

## Testing

```bash
# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test

# Integration tests
cd backend && npm run test:integration
```

## Submitting Changes

1. Ensure all tests pass
2. Update documentation if needed
3. Create a clear Pull Request description
4. Reference related issues (if applicable)

## Code Review

All submissions require review before merging. We aim to review PRs within 48 hours.

## Questions?

Open an issue or discussion on GitHub.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
