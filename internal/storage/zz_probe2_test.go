package storage

import (
	"testing"
	"time"

	"github.com/carsteneu/yesmem/internal/models"
)

func TestProbe2SourceFile(t *testing.T) {
	s := mustOpen(t)
	id, err := s.InsertLearning(&models.Learning{Category: "gotcha", Content: "doc note", CreatedAt: time.Now(), ModelUsed: "opus", SourceFile: "docs/api.md"})
	t.Logf("insert id=%d err=%v", id, err)
	ls, err := s.GetLearningsBySourceFile("docs/api.md")
	t.Logf("by-source-file: n=%d err=%v", len(ls), err)
	one, err := s.GetLearning(id)
	t.Logf("get: srcfile=%q scope=%q err=%v", one.SourceFile, one.SharingScope, err)
}
