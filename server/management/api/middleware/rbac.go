package middleware

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
)

// denial is why a gate refused a request; nil means allowed.
type denial struct {
	status int
	msg    string
}

var errInsufficientRole = &denial{http.StatusForbidden, "insufficient role"}

// gate is the shape every RBAC middleware shares: 401 without a session, a
// super admin always passes, and otherwise check decides for the caller.
func gate(check func(c *echo.Context, userID string) *denial) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			claims := ClaimsFrom(c)
			if claims == nil {
				return unauth(c)
			}
			if claims.IsSuperAdmin {
				return next(c)
			}
			if d := check(c, claims.UserID); d != nil {
				return c.JSON(d.status, model.APIResponse{Message: d.msg})
			}
			return next(c)
		}
	}
}

func RequireSuperAdmin() echo.MiddlewareFunc {
	return gate(func(*echo.Context, string) *denial {
		return &denial{http.StatusForbidden, "super admin required"}
	})
}

// RequireTeamRole gates routes whose paramName path param is a team id.
func RequireTeamRole(teams *service.TeamService, paramName string, minRole model.Role) echo.MiddlewareFunc {
	return gate(func(c *echo.Context, userID string) *denial {
		teamID := c.Param(paramName)
		if teamID == "" {
			return &denial{http.StatusBadRequest, "missing team id"}
		}
		return teamRole(c, teams, teamID, userID, minRole)
	})
}

// RequireCompanyRole gates routes whose paramName path param is a company id.
func RequireCompanyRole(
	companies *service.CompanyService, paramName string, minRole model.CompanyRole,
) echo.MiddlewareFunc {
	return gate(func(c *echo.Context, userID string) *denial {
		companyID := c.Param(paramName)
		if companyID == "" {
			return &denial{http.StatusBadRequest, "missing company id"}
		}
		role, err := companies.Role(c.Request().Context(), companyID, userID)
		if err != nil {
			return serverError(c, err, "failed to load company membership")
		}
		// AtLeast denies the empty (no) role.
		if !role.AtLeast(minRole) {
			return &denial{http.StatusForbidden, "insufficient company role"}
		}
		return nil
	})
}

// RequireFlagsetRole resolves the team owning the flagset (path param
// paramName) and checks the caller's role on it.
func RequireFlagsetRole(
	teams *service.TeamService, flagsets *service.FlagsetService, paramName string, minRole model.Role,
) echo.MiddlewareFunc {
	return gate(func(c *echo.Context, userID string) *denial {
		return flagsetRole(c, teams, flagsets, c.Param(paramName), userID, minRole)
	})
}

// RequireFlagRole resolves flag → flagset → team and checks the caller's role.
func RequireFlagRole(
	teams *service.TeamService, flagsets *service.FlagsetService, flags *service.FlagService,
	paramName string, minRole model.Role,
) echo.MiddlewareFunc {
	return gate(func(c *echo.Context, userID string) *denial {
		fsID, err := flags.FlagsetID(c.Request().Context(), c.Param(paramName))
		if errors.Is(err, service.ErrNotFound) {
			return &denial{http.StatusNotFound, "flag not found"}
		}
		if err != nil {
			return serverError(c, err, "failed to load flag")
		}
		return flagsetRole(c, teams, flagsets, fsID, userID, minRole)
	})
}

func flagsetRole(
	c *echo.Context, teams *service.TeamService, flagsets *service.FlagsetService, flagsetID, userID string,
	minRole model.Role,
) *denial {
	fs, err := flagsets.Get(c.Request().Context(), flagsetID)
	if errors.Is(err, service.ErrNotFound) {
		return &denial{http.StatusNotFound, "flagset not found"}
	}
	if err != nil {
		return serverError(c, err, "failed to load flagset")
	}
	return teamRole(c, teams, fs.TeamID, userID, minRole)
}

func teamRole(c *echo.Context, teams *service.TeamService, teamID, userID string, minRole model.Role) *denial {
	role, err := teams.Role(c.Request().Context(), teamID, userID)
	if err != nil {
		return serverError(c, err, "failed to load membership")
	}
	// AtLeast denies the empty (no) role.
	if !role.AtLeast(minRole) {
		return errInsufficientRole
	}
	return nil
}

// serverError logs a failed RBAC lookup (unless the client went away) and
// denies with a 500.
func serverError(c *echo.Context, err error, msg string) *denial {
	if !errors.Is(err, context.Canceled) {
		slog.ErrorContext(c.Request().Context(), msg, "error", err)
	}
	return &denial{http.StatusInternalServerError, msg}
}
