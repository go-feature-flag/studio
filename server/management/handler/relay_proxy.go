package handler

import (
	"net/http"

	"github.com/gofeatureflag/flag-management-system/server/management/api/middleware"
	"github.com/gofeatureflag/flag-management-system/server/management/model"
	"github.com/labstack/echo/v5"
)

// GetRelayProxySecret godoc
// @Summary  Relay proxy secret of a company (company admin)
// @Tags     companies
// @Produce  json
// @Param    companyId path string true "company id"
// @Success  200 {object} model.APIResponse{data=model.RelayProxySecret} "data is null when no secret was generated"
// @Failure  401 {object} model.APIResponse "no valid session"
// @Failure  403 {object} model.APIResponse
// @Failure  404 {object} model.APIResponse
// @Router   /companies/{companyId}/relay-proxy-secret [get]
func (h *CompanyHandler) GetRelayProxySecret(c *echo.Context) error {
	s, err := h.svc.RelayProxySecret(c.Request().Context(), c.Param("companyId"))
	if err != nil {
		return writeServiceError(c, err, "failed to get relay proxy secret")
	}
	return ok(c, s)
}

// RotateRelayProxySecret godoc
// @Summary     Generate a new relay proxy secret (company admin)
// @Description The replaced secret stays valid for keepPreviousSeconds (default 0: revoked at once);
// @Description a secret replaced by an earlier rotation is revoked at once.
// @Tags        companies
// @Accept      json
// @Produce     json
// @Param       companyId path string true "company id"
// @Param       body body model.RotateRelayProxySecretRequest false "rotation options"
// @Success     200 {object} model.APIResponse{data=model.RelayProxySecret}
// @Failure     400 {object} model.APIResponse
// @Failure     401 {object} model.APIResponse "no valid session"
// @Failure     403 {object} model.APIResponse
// @Failure     404 {object} model.APIResponse
// @Router      /companies/{companyId}/relay-proxy-secret [post]
func (h *CompanyHandler) RotateRelayProxySecret(c *echo.Context) error {
	// Bind leaves req zero for an empty body: no grace period.
	var req model.RotateRelayProxySecretRequest
	if err := c.Bind(&req); err != nil {
		return bindError(c, err)
	}
	claims := middleware.MustClaims(c)
	s, err := h.svc.RotateRelayProxySecret(c.Request().Context(), claims.UserID, c.Param("companyId"), &req)
	if err != nil {
		return writeServiceError(c, err, "failed to rotate relay proxy secret")
	}
	return ok(c, s)
}

// RevokePreviousRelayProxySecret godoc
// @Summary  Revoke the relay proxy secret a rotation replaced, before its expiry (company admin)
// @Tags     companies
// @Param    companyId path string true "company id"
// @Success  204
// @Failure  401 {object} model.APIResponse "no valid session"
// @Failure  403 {object} model.APIResponse
// @Failure  404 {object} model.APIResponse
// @Router   /companies/{companyId}/relay-proxy-secret/previous [delete]
func (h *CompanyHandler) RevokePreviousRelayProxySecret(c *echo.Context) error {
	claims := middleware.MustClaims(c)
	err := h.svc.RevokePreviousRelayProxySecret(c.Request().Context(), claims.UserID, c.Param("companyId"))
	if err != nil {
		return writeServiceError(c, err, "failed to revoke the previous relay proxy secret")
	}
	return noContent(c)
}

// RelayProxyFlagSets godoc
// @Summary     Flagsets of the company, for the relay proxy's studio.url option
// @Description Authenticated with "Authorization: Bearer <relay proxy secret>", not the session.
// @Description The body is the relay proxy configuration itself (no envelope); each flagset reads its
// @Description flags from /relay-proxy/flagsets/{id}/flags.json on the host the request was sent to.
// @Tags        relay-proxy
// @Produce     json
// @Success     200 {object} model.RelayProxyFile
// @Failure     401 {object} model.APIResponse "missing or unknown secret"
// @Router      /relay-proxy/flagsets.json [get]
func (h *FlagsetHandler) RelayProxyFlagSets(c *echo.Context) error {
	// The relay proxy reached Studio at this address, so its retrievers can too.
	base := c.Scheme() + "://" + c.Request().Host + "/api/v1/relay-proxy/flagsets/"
	file, err := h.svc.RelayProxyFlagSets(c.Request().Context(), middleware.MustRelayProxyCompanyID(c),
		func(id string) string { return base + id + "/flags.json" },
		c.Request().Header.Get(echo.HeaderAuthorization))
	if err != nil {
		return writeServiceError(c, err, "failed to list flagsets")
	}
	return c.JSON(http.StatusOK, file)
}

// RelayProxyFlags godoc
// @Summary     Flags of a flagset as a GO Feature Flag JSON flag file, for the relay proxy's http retriever
// @Description Authenticated with "Authorization: Bearer <relay proxy secret>", not the session.
// @Description The body is the flag file itself (no envelope): flag name → flag configuration.
// @Tags        relay-proxy
// @Produce     json
// @Param       id path string true "flagset id"
// @Success     200 {object} map[string]object
// @Failure     401 {object} model.APIResponse "missing or unknown secret"
// @Failure     404 {object} model.APIResponse "no such flagset in the secret's company"
// @Router      /relay-proxy/flagsets/{id}/flags.json [get]
func (h *FlagsetHandler) RelayProxyFlags(c *echo.Context) error {
	flags, err := h.svc.RelayProxyFlags(c.Request().Context(), middleware.MustRelayProxyCompanyID(c), c.Param("id"))
	if err != nil {
		return writeServiceError(c, err, "failed to list flags")
	}
	return c.JSONBlob(http.StatusOK, flags)
}
