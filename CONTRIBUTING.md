# Contributing to 1230-UI

Thank you for your interest in contributing to 1230-UI! This document provides guidelines and information for contributors.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How to Contribute

### Reporting Bugs

Before creating a bug report:
1. Check if the issue already exists in [GitHub Issues](https://github.com/Pingvin1230/1230-ui/issues)
2. Use a clear and descriptive title
3. Include steps to reproduce the issue
4. Specify your environment (OS, Node.js version, browser)
5. Include relevant logs or screenshots

### Suggesting Features

Feature suggestions are welcome! Please:
1. Check existing issues for similar suggestions
2. Describe the feature and its use case
3. Explain how it improves the project

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Verify the full CI pipeline passes locally (see below)
5. Commit with clear messages following [Conventional Commits](https://www.conventionalcommits.org/)
6. Push to your fork (`git push origin feature/amazing-feature`)
7. Open a Pull Request — CI will run automatically on GitHub

## Development Setup

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for detailed setup instructions.

Quick start:
```bash
git clone https://github.com/Pingvin1230/1230-ui.git
cd 1230-ui
npm install
npm run dev
```

## Code Style

- **TypeScript** — all new frontend code must be TypeScript. New backend middleware should be written in `middleware/*.ts`.
- **ESLint** — follow the configured rules; `npm run lint` must produce zero output.
- **React** — functional components with hooks; `useCallback` with complete deps for functions used in `useEffect`.
- **CSS** — Tailwind CSS utility classes; use design tokens (`text-fg-primary`, `bg-bg-secondary`, etc.) for colors.
- **Touch targets** — all interactive icon buttons must have `min-h-[44px] min-w-[44px]`.

See [docs/DEVELOPMENT.md § Code Style](docs/DEVELOPMENT.md#code-style) for the full guidelines.

## Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(chat): add message regeneration button
fix(api): resolve session creation timeout
docs(readme): update installation instructions
```

## Testing

Before submitting a PR, run the full CI pipeline locally:

```bash
npm run lint        # ESLint — zero warnings required
npm run typecheck   # TypeScript — zero errors required
npm test            # Vitest — all tests must pass
npm run build       # Production build — must succeed
```

When adding new functionality, include tests:
- Backend utilities / middleware → `tests/*.test.js`
- Frontend utilities → `src/**/*.test.ts`

See [docs/DEVELOPMENT.md § Testing](docs/DEVELOPMENT.md#testing) for details.

## Documentation

If you're adding a feature, please update the relevant documentation:
- User-facing features → README.md or docs/
- API changes → docs/API.md
- Configuration → docs/CONFIGURATION.md

## Questions?

Feel free to open an issue for any questions about contributing.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
