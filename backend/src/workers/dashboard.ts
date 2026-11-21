import type { AppEnv } from "../env";
import { D1ApiKeyRepository } from "../repositories/api-key-repository";
import { D1LedgerRepository } from "../repositories/ledger-repository";
import { createDashboardApp } from "../routes/dashboard-routes";
import { AuthService } from "../services/auth-service";
import { LedgerService } from "../services/ledger-service";

export const createDashboardDependencies = (env: AppEnv) => ({
  auth: new AuthService(new D1ApiKeyRepository(env.DB)),
  ledger: new LedgerService(new D1LedgerRepository(env.DB)),
});

export default createDashboardApp(createDashboardDependencies);
