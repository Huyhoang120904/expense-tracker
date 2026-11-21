import type { ApiKeyWithClientRecord } from "../domain/types";

export interface ApiKeyRepository {
  findKeyWithClientById(keyId: string): Promise<ApiKeyWithClientRecord | null>;
}

export class D1ApiKeyRepository implements ApiKeyRepository {
  constructor(private readonly db: D1Database) {}

  async findKeyWithClientById(
    keyId: string,
  ): Promise<ApiKeyWithClientRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT
           k.id,
           k.client_id,
           k.secret_hash,
           k.scopes_json,
           k.created_at,
           k.expires_at,
           k.revoked_at,
           c.name AS client_name,
           c.kind AS client_kind
         FROM api_keys k
         INNER JOIN api_clients c ON c.id = k.client_id
         WHERE k.id = ?`,
      )
      .bind(keyId)
      .first<ApiKeyWithClientRecord>();

    return row ?? null;
  }
}
