package main

import (
	"crypto/subtle"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

const ownerUserIDEnv = "CWK_OWNER_USER_ID"

// requireOwner allows PocketBase superusers and exactly one explicitly configured
// users record. An unset or malformed owner id intentionally fails closed for
// regular users.
func requireOwner(ownerUserID string) *hook.Handler[*core.RequestEvent] {
	ownerUserID = normalizedOwnerUserID(ownerUserID)
	return &hook.Handler[*core.RequestEvent]{
		Id: "cwkRequireOwner",
		Func: func(e *core.RequestEvent) error {
			if e.Auth == nil {
				return e.UnauthorizedError("The request requires OWNER authorization.", nil)
			}
			if e.Auth.IsSuperuser() {
				return e.Next()
			}
			if ownerUserID == "" || e.Auth.Collection().Name != "users" || !constantTimeStringEqual(e.Auth.Id, ownerUserID) {
				return e.ForbiddenError("The authorized record is not the OWNER.", nil)
			}
			return e.Next()
		},
	}
}

func normalizedOwnerUserID(value string) string {
	value = strings.TrimSpace(value)
	if !isPocketBaseRecordID(value) {
		return ""
	}
	return value
}

func constantTimeStringEqual(left, right string) bool {
	if len(left) != len(right) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(left), []byte(right)) == 1
}
