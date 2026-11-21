import { D1ApiKeyRepository } from "../repositories/api-key-repository";
import { D1LedgerRepository } from "../repositories/ledger-repository";
import { createIntegrationApp } from "../routes/integration-routes";
import { AuthService } from "../services/auth-service";
import { LedgerService } from "../services/ledger-service";

const app = createIntegrationApp((env) => ({
  auth: new AuthService(new D1ApiKeyRepository(env.DB)),
  ledger: new LedgerService(new D1LedgerRepository(env.DB)),
}));

export default app;
