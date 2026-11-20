package storage

// The canonical sharing-scope migration (remediation WS-C). The legacy
// 'public' value meant "published to every viewer" — the governance model
// names that semantics ScopeGlobal, so at open time the value is rewritten.
// The rewrite is idempotent, it touches nothing but the scope column, and it
// never widens access: ownership and lifecycle stay byte-identical, and a
// reader that still speaks the legacy vocabulary keeps accepting 'public'.

// migrateSharingScopes rewrites the legacy scope vocabulary to the canonical
// one. It runs inside one transaction so a partial migration can never persist.
func (s *Store) migrateSharingScopes() error {
	_, err := s.db.Exec(`UPDATE learnings SET scope = 'global' WHERE scope = 'public'`)
	return err
}

// MigrateSharingScopesForTest exposes the migration to the daemon tests: the
// daemon seeds rows through the store API, so a test that plants legacy
// vocabulary after open has to run the rewrite by hand.
func (s *Store) MigrateSharingScopesForTest() error {
	return s.migrateSharingScopes()
}
