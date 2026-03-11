/**
 * IAST (Interactive Application Security Testing) stage types.
 *
 * IAST events are produced by an external runtime agent and consumed
 * by this stage to confirm code paths observed during test execution.
 */

/**
 * A single IAST event recording a runtime observation.
 */
export interface IastEvent {
  /** Unique event identifier */
  eventId: string;
  /** HTTP method observed */
  method: string;
  /** URL path observed */
  path: string;
  /** Normalized path template (e.g. /users/{id}) */
  normalizedPath?: string;
  /** Timestamp of the observation */
  timestamp?: string;
  /** Test that triggered this event (if known) */
  testId?: string;
  /** Source file of the handler (if known) */
  handlerFile?: string;
  /** Handler function name (if known) */
  handlerFunction?: string;
  /** HTTP status code observed */
  statusCode?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Shape of the iast-events.json file.
 */
export interface IastEventsFile {
  events: IastEvent[];
  generatedAt?: string;
  agentVersion?: string;
}

/**
 * Output of the IAST stage.
 */
export interface IastOutput {
  events: IastEvent[];
  confirmedEndpoints: string[];
  runtimeEventNodesCreated: number;
}
