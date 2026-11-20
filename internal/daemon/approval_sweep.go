package daemon

import (
	"context"
	"log"
	"time"

	"github.com/NasserJabir/Nemons/internal/storage"
)

// approvalSweepInterval is how often open governance asks are checked against
// their expiry. An ask is at most governanceAskTTL old when it qualifies, so
// this tick bounds the visible lifetime of an unanswered ask to the TTL plus
// one interval.
const approvalSweepInterval = time.Hour

// startApprovalSweep closes open governance asks whose expiry passed. Only a
// decision or this sweep ends an ask; nothing else reaches those rows, so an
// ask nobody decided would sit open forever — and the gate keeps telling its
// caller to wait on it. Every row the sweep closes writes its own
// approval.expired audit event (see storage.ExpireStaleApprovals).
func startApprovalSweep(ctx context.Context, store *storage.Store) {
	sweep := func() {
		closed, err := store.ExpireStaleApprovals(time.Now())
		if err != nil {
			log.Printf("[governance] expire stale approvals: %v", err)
			return
		}
		if closed > 0 {
			log.Printf("[governance] expired %d open asks whose expiry passed", closed)
		}
	}

	sweep()
	ticker := time.NewTicker(approvalSweepInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sweep()
		}
	}
}
