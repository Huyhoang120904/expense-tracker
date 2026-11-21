export type AppEnv = Omit<
  Env,
  | "CF_ACCESS_TEAM_DOMAIN"
  | "CF_ACCESS_AUD"
  | "OWNER_EMAIL"
  | "DEV_AUTH_MODE"
  | "DASHBOARD_ORIGIN"
> & {
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  OWNER_EMAIL?: string;
  DEV_AUTH_MODE?: string;
  DASHBOARD_ORIGIN?: string;
};
