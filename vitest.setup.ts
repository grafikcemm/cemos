/**
 * WP-02f — global unit setup: DATABASE_URL yapısal koruması.
 * Ayrıntı ve testler: src/lib/testing/unitDbGuard.ts
 */
import { enforceUnitDatabaseUrl } from "./src/lib/testing/unitDbGuard";

enforceUnitDatabaseUrl();
