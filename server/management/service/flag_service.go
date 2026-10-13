package service

import (
	"context"
	"encoding/json"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/repository"
	"github.com/jackc/pgx/v5"
)

type FlagService struct {
	db       *repository.DB
	flags    *repository.FlagRepo
	versions *repository.FlagVersionRepo
	flagsets *repository.FlagsetRepo
	audit    *repository.AuditRepo
}

func NewFlagService(
	db *repository.DB, flags *repository.FlagRepo, versions *repository.FlagVersionRepo,
	flagsets *repository.FlagsetRepo, audit *repository.AuditRepo,
) *FlagService {
	return &FlagService{db: db, flags: flags, versions: versions, flagsets: flagsets, audit: audit}
}

// Create creates the flag with its first version, current pointer and tag
// mirror in one transaction, audited in the same transaction. The repository
// locks the live flagset, so a flag can't be created under a flagset being
// deleted (ErrNotFound).
func (s *FlagService) Create(
	ctx context.Context, actorID, flagsetID string, req *model.CreateFlagRequest,
) (*model.Flag, error) {
	if errs := model.ValidateFlagName(req.Name); len(errs) > 0 {
		return nil, errs
	}
	payload, err := preparePayload(req.Payload)
	if err != nil {
		return nil, err
	}
	fs, err := s.liveFlagset(ctx, flagsetID)
	if err != nil {
		return nil, err
	}

	var out *model.Flag
	err = pgx.BeginFunc(ctx, s.db.Pool, func(tx pgx.Tx) error {
		f, err := s.flags.Create(ctx, tx, flagsetID, req.Name)
		if err != nil {
			return err
		}
		if err := s.saveVersion(ctx, tx, f, payload, req.Comment, actorID); err != nil {
			return err
		}
		out = f
		return s.audit.Record(ctx, tx, repository.AuditInput{
			ActorUserID: &actorID, TeamID: &fs.TeamID, FlagsetID: &flagsetID, FlagID: &f.ID,
			Action: model.AuditActionCreate, TargetType: model.AuditTargetFlag, TargetID: f.ID, After: f,
		})
	})
	if err != nil {
		return nil, writeError(err)
	}
	return out, nil
}

// saveVersion stores payload as f's new current version and mirrors its tags,
// inside tx, and updates f.
func (s *FlagService) saveVersion(
	ctx context.Context, tx pgx.Tx, f *model.Flag, payload json.RawMessage, comment, actorID string,
) error {
	v, err := s.versions.Insert(ctx, tx, f.ID, payload, comment, &actorID)
	if err != nil {
		return err
	}
	if err := s.flags.UpdateCurrentVersion(ctx, tx, f.ID, v.ID); err != nil {
		return err
	}
	if err := s.flags.ReplaceFlagTags(ctx, tx, f.ID, model.FlagTagsFromPayload(payload)); err != nil {
		return err
	}
	f.CurrentVersionID, f.CurrentVersion, f.Payload = &v.ID, &v.VersionNumber, v.Payload
	return nil
}

// liveFlagset returns the flagset, or ErrNotFound when it is missing or deleted.
func (s *FlagService) liveFlagset(ctx context.Context, id string) (*model.Flagset, error) {
	fs, err := s.flagsets.GetByID(ctx, id)
	if err == nil && fs == nil {
		return nil, ErrNotFound
	}
	return fs, err
}

// preparePayload validates a flag payload and returns the bytes to store: the raw
// bytes as sent (key order preserved), not a re-marshaled DTO, with
// metadata.flagType auto-managed so the exported config carries the flag's
// OpenFeature type, and metadata.tags normalized so the stored config, the
// flag_tags mirror, and the list projection all agree.
func preparePayload(raw json.RawMessage) (json.RawMessage, error) {
	invalid := model.ValidationErrors{{Field: "payload", Message: "invalid payload JSON"}}
	dto, err := model.ParseFlagPayload(raw)
	if err != nil {
		return nil, invalid
	}
	if errs := model.ValidateFlagPayload(dto); len(errs) > 0 {
		return nil, errs
	}
	if errs := model.ValidateFlagTags(raw); len(errs) > 0 {
		return nil, errs
	}
	payload, err := model.SetFlagTypeMetadata(raw)
	if err != nil {
		return nil, invalid
	}
	payload, err = model.NormalizeFlagTags(payload)
	if err != nil {
		return nil, invalid
	}
	return payload, nil
}

// teamIDOf returns the id of the team owning flagsetID, or nil when it can't be
// resolved (audit enrichment only, so lookup errors are ignored).
func teamIDOf(ctx context.Context, flagsets *repository.FlagsetRepo, flagsetID string) *string {
	fs, _ := flagsets.GetByID(ctx, flagsetID)
	if fs == nil {
		return nil
	}
	return &fs.TeamID
}

func (s *FlagService) Get(ctx context.Context, id string) (*model.Flag, error) {
	f, err := s.flags.GetByID(ctx, id)
	if err == nil && f == nil {
		return nil, ErrNotFound
	}
	return f, err
}

func (s *FlagService) List(
	ctx context.Context, flagsetID string, f model.FlagFilters,
) ([]model.FlagListItem, int, error) {
	return s.flags.ListByFlagset(ctx, flagsetID, f)
}

// ListByTeam lists one page of a team's flags matching the filters, with the
// total match count.
func (s *FlagService) ListByTeam(
	ctx context.Context, teamID string, filters model.TeamFlagFilters,
) ([]model.FlagInstance, int, error) {
	return s.flags.ListByTeam(ctx, teamID, filters)
}

func (s *FlagService) ListTeamOwners(ctx context.Context, teamID string) ([]string, error) {
	return s.flags.ListTeamOwners(ctx, teamID)
}

func (s *FlagService) ListTeamTags(ctx context.Context, teamID string) ([]string, error) {
	return s.flags.ListTeamTags(ctx, teamID)
}

// Update saves payload as the flag's new current version. The flag is read
// and locked inside the transaction, so concurrent saves serialize and each
// audit entry's before is the version it actually replaced, and a save racing
// a delete fails with ErrNotFound instead of writing to a deleted flag.
func (s *FlagService) Update(
	ctx context.Context, actorID, id string, req *model.UpdateFlagRequest,
) (*model.Flag, error) {
	payload, err := preparePayload(req.Payload)
	if err != nil {
		return nil, err
	}
	// The team for the audit entry, read before the transaction so it never
	// waits for a second pool connection while holding one. A flag doesn't
	// move between flagsets.
	current, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	fs, err := s.liveFlagset(ctx, current.FlagsetID)
	if err != nil {
		return nil, err
	}
	var out *model.Flag
	err = pgx.BeginFunc(ctx, s.db.Pool, func(tx pgx.Tx) error {
		before, err := s.flags.GetForUpdate(ctx, tx, id)
		if err != nil {
			return err
		}
		if before == nil {
			return ErrNotFound
		}
		// A flag's type is immutable after creation (checked against the
		// variations, before any metadata injection).
		if errs := model.ValidateFlagTypeUnchanged(before.Payload, req.Payload); len(errs) > 0 {
			return errs
		}
		after := *before
		if err := s.saveVersion(ctx, tx, &after, payload, req.Comment, actorID); err != nil {
			return err
		}
		out = &after
		return s.audit.Record(ctx, tx, repository.AuditInput{
			ActorUserID: &actorID, TeamID: &fs.TeamID, FlagsetID: &before.FlagsetID, FlagID: &id,
			Action: model.AuditActionUpdate, TargetType: model.AuditTargetFlag, TargetID: id,
			Before: before, After: &after,
		})
	})
	if err != nil {
		return nil, writeError(err)
	}
	return out, nil
}

// flagState is the audit payload of an enable/disable.
type flagState struct {
	Disabled bool `json:"disabled"`
}

func (s *FlagService) SetDisabled(ctx context.Context, actorID, id string, disabled bool) error {
	before, err := s.Get(ctx, id)
	if err != nil {
		return err
	}
	if err := s.flags.SetDisabled(ctx, id, disabled); err != nil {
		return writeError(err)
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, TeamID: teamIDOf(ctx, s.flagsets, before.FlagsetID),
		FlagsetID: &before.FlagsetID, FlagID: &id,
		Action: model.AuditActionUpdate, TargetType: model.AuditTargetFlag, TargetID: id,
		Before: flagState{before.Disabled}, After: flagState{disabled},
	})
	return nil
}

func (s *FlagService) Delete(ctx context.Context, actorID, id string) error {
	before, err := s.Get(ctx, id)
	if err != nil {
		return err
	}
	if err := s.flags.SoftDelete(ctx, id); err != nil {
		return writeError(err)
	}
	_ = s.audit.Record(ctx, nil, repository.AuditInput{
		ActorUserID: &actorID, TeamID: teamIDOf(ctx, s.flagsets, before.FlagsetID),
		FlagsetID: &before.FlagsetID, FlagID: &id,
		Action: model.AuditActionDelete, TargetType: model.AuditTargetFlag, TargetID: id, Before: before,
	})
	return nil
}

func (s *FlagService) FlagsetID(ctx context.Context, flagID string) (string, error) {
	return s.flags.GetFlagsetID(ctx, flagID)
}

// Evaluate test-evaluates a flag against the supplied evaluation context, running
// the real go-feature-flag evaluation engine. The flag's visibility is enforced
// by the route's RBAC middleware; here we load its current payload and the
// flagset's evaluationContextEnrichment so the result mirrors production.
func (s *FlagService) Evaluate(
	ctx context.Context, flagID string, req *model.EvaluateFlagRequest,
) (*model.EvaluationResult, error) {
	f, err := s.Get(ctx, flagID)
	if err != nil {
		return nil, err
	}
	fs, err := s.liveFlagset(ctx, f.FlagsetID)
	if err != nil {
		return nil, err
	}
	return model.EvaluateFlag(f.Name, f.Payload, fs.EvaluationContextEnrichment, f.Disabled, req)
}
