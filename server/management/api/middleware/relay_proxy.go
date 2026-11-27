package middleware

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/gofeatureflag/flag-management-system/server/management/service"
	"github.com/labstack/echo/v5"
)

// ContextRelayProxyCompanyKey holds the company RequireRelayProxySecret authenticated.
const ContextRelayProxyCompanyKey = "goff_mgmt.relay_proxy_company"

// RequireRelayProxySecret authenticates a relay proxy with its company's
// secret, sent as "Authorization: Bearer <secret>". It stands in for the
// session: a relay proxy is no user, so its routes have no RBAC.
func RequireRelayProxySecret(companies *service.CompanyService) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			secret, found := strings.CutPrefix(c.Request().Header.Get(echo.HeaderAuthorization), "Bearer ")
			if !found || secret == "" {
				return unauth(c)
			}
			companyID, err := companies.CompanyIDByRelayProxySecret(c.Request().Context(), secret)
			if errors.Is(err, service.ErrUnauthenticated) {
				return unauth(c)
			}
			if err != nil {
				if !errors.Is(err, context.Canceled) {
					slog.ErrorContext(c.Request().Context(), "authenticate relay proxy", "error", err)
				}
				return c.JSON(http.StatusInternalServerError, model.APIResponse{Message: "failed to authenticate"})
			}
			c.Set(ContextRelayProxyCompanyKey, companyID)
			return next(c)
		}
	}
}

// MustRelayProxyCompanyID returns the company RequireRelayProxySecret stored.
// Like MustClaims, it panics on a route registered without the middleware.
func MustRelayProxyCompanyID(c *echo.Context) string {
	id, _ := c.Get(ContextRelayProxyCompanyKey).(string)
	if id == "" {
		panic("middleware.MustRelayProxyCompanyID: no company, route is missing RequireRelayProxySecret")
	}
	return id
}
