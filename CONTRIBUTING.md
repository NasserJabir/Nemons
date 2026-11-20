# Contributing to Nemons

Thank you for your interest in contributing to Nemons.

## Getting Started

### Build

```bash
make build          # Build binary → ./nemons
make test           # Run all tests
make install        # Build + install to ~/.local/bin/nemons
```

Go environment is self-contained (custom GOROOT/GOPATH/GOCACHE set in Makefile). CGO is disabled.

### Run a single test

```bash
go test ./internal/proxy/ -run TestCollapse -count=1
```

## Code Style

- Go conventions (gofmt, standard library patterns)
- One concern per file — see `internal/proxy/` as reference
- Tests live next to the code they test (`*_test.go`)
- No external state outside the architecture — persistent and traceable

## Reporting Issues

- **Bug reports:** Use the [Bug Report](https://github.com/NasserJabir/Nemons/issues/new?template=bug_report.md) template
- **Feature requests:** Use the [Feature Request](https://github.com/NasserJabir/Nemons/issues/new?template=feature_request.md) template

## Pull Requests

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Run `make test` to verify
5. Submit a PR against `main`

Keep PRs focused — one concern per PR, just like one concern per file.

## License

By contributing, you agree that your contributions will be licensed under the [FSL-1.1-ALv2](LICENSE) license.
