package config

import "errors"

// Validate reports every invalid or missing value in c, joined into one error.
func (c *Config) Validate() error {
	var errs []error
	if c.Server.Port <= 0 || c.Server.Port > 65535 {
		errs = append(errs, errors.New("server.port must be between 1 and 65535"))
	}
	if c.DB.URL == "" {
		errs = append(errs, errors.New("db.url is required"))
	}
	if c.OIDC.Issuer == "" {
		errs = append(errs, errors.New("oidc.issuer is required"))
	}
	if c.OIDC.ClientID == "" {
		errs = append(errs, errors.New("oidc.clientId is required"))
	}
	if c.OIDC.ClientSecret == "" {
		errs = append(errs, errors.New("oidc.clientSecret is required"))
	}
	if c.OIDC.RedirectURL == "" {
		errs = append(errs, errors.New("oidc.redirectUrl is required"))
	}
	if c.Auth.JWTSecret == "" {
		errs = append(errs, errors.New("auth.jwtSecret is required"))
	} else if len(c.Auth.JWTSecret) < 32 {
		errs = append(errs, errors.New("auth.jwtSecret must be at least 32 chars"))
	}
	return errors.Join(errs...)
}
