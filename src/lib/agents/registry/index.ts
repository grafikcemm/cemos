import { AGENT_ADAPTERS } from "./adapters";
import { AGENT_DEFINITIONS } from "./definitions";
import { validateRegistry } from "./validate";

/**
 * Registry giriş noktası (ADR-027). Modül YÜKLENİRKEN fail-fast doğrulanır:
 * duplicate id / adapter'sız entry / şemasız entry / geçersiz preset-timeout-
 * retry / tanımsız capability / provenance-memory çelişkisi / fixture eksiği
 * → AgentRegistryError. Sakat registry ile hiçbir koşu başlayamaz.
 */
validateRegistry(AGENT_DEFINITIONS, AGENT_ADAPTERS);

export { AGENT_DEFINITIONS, AGENT_ROLE_IDS } from "./definitions";
export { AGENT_ADAPTERS, getAdapter } from "./adapters";
export { executeAgent, getLostTraceCount, type ExecuteAgentContext } from "./executor";
export { validateRegistry, collectRegistryProblems } from "./validate";
export { AGENT_EVAL_FIXTURES, fixturesForAgent, fixtureById } from "./fixtures";
export * from "./types";
export {
  CuratorInputSchema,
  CuratorOutputSchema,
  CuratorCandidateSchema,
  runDeterministicCuration,
  runAgentCuration,
  assertSelectionsBoundToInput,
  isAgentCurationEnabled,
} from "./opportunityCurator";
