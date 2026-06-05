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
4. Test your changes (`npm run build`, `npm run lint`)
5. Commit with clear messages following [Conventional Commits](https://www.conventionalcommits.org/)
6. Push to your fork (`git push origin feature/amazing-feature`)
7. Open a Pull Request

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

- **TypeScript** — all new code should be in TypeScript
- **ESLint** — follow the configured rules
- **Prettier** — code formatting (optional but recommended)
- **React** — functional components with hooks
- **CSS** — Tailwind CSS with design tokens

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

Before submitting a PR:
```bash
npm run build    # Ensure build succeeds
npm run lint     # Check for lint errors
```

## Documentation

If you're adding a feature, please update the relevant documentation:
- User-facing features → README.md or docs/
- API changes → docs/API.md
- Configuration → docs/CONFIGURATION.md

## Questions?

Feel free to open an issue for any questions about contributing.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
