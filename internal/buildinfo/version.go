package buildinfo

// Version is set at build time via ldflags:
//
//	go build -ldflags "-X github.com/NasserJabir/Nemons/internal/buildinfo.Version=..."
var Version = "dev"
