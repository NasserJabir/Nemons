package models

// The canonical sharing scopes (remediation WS-C). Ownership (SourceAgent),
// sharing scope and lifecycle (superseded_by / expires_at) are independent
// properties: a row's owner never widens or narrows who may read it, and a
// scope transition never rewrites ownership.

const (
	// ScopeGlobal: shared across authorized projects and agents — explicitly
	// governed (the memory.public_write standing grant), never implicitly
	// accessible.
	ScopeGlobal = "global"
	// ScopeProject: visible to every viewer of that project's reads.
	ScopeProject = "project"
	// ScopePrivate: bound to one stable agent identity; another agent reads it
	// as absent unless an explicit, governed transition moves it.
	ScopePrivate = "private"
)

// NormalizeSharingScope canonicalizes a written scope value: the legacy
// "public" value maps onto ScopeGlobal (it always meant "published for
// everyone"), an empty value stays the project-shared default, and an unknown
// value normalizes to "" — which every write path must refuse fail-closed.
// Reading tolerates the legacy values that may still sit in older databases.
func NormalizeSharingScope(scope string) string {
	switch scope {
	case ScopePrivate, ScopeProject, ScopeGlobal, "public", "":
		switch scope {
		case "public":
			return ScopeGlobal
		case ScopeGlobal:
			return ScopeGlobal
		case ScopePrivate:
			return ScopePrivate
		default:
			return ScopeProject
		}
	default:
		return ""
	}
}
