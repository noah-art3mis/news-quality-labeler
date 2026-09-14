# Local preview architecture

The core domain is source assessment: determine which source entry supplies a link's rating and preserve the evidence behind the result. The webpage, dataset host, and Bluesky are outside that domain.

## Functional core

`src/labeling/` owns post-URL validation, source matching, hosting boundaries, grouping, and source-quality classification. Its functions accept values and return assessments. They do not read the network, filesystem, environment, or clock. `src/ratings/snapshot.ts` translates CSV content into a validated rating snapshot.

The matching order is section, exact hostname, then permitted parent hostname. Section matches require the same hostname and a path-segment boundary. Parent matches stop at the independently operated site's boundary. `SourceAssessment.status` explicitly distinguishes rated, unmatched, and unresolved results; display text is never parsed back into a decision.

The versioned provisional category policy lives in `src/labeling/quality-policy.ts`. The use case passes it explicitly to the pure assessment function and returns it with the result, so displayed boundaries describe the policy used. Rated results carry both score and category; unmatched and unresolved results carry neither.

`src/labeling/post-labels.ts` derives a distinct, ordered category set from the assessed sources. Both direct and one-level quoted sources contribute to the submitted post's proposal. The application returns this proposal beside the source evidence; the webpage renders it without reimplementing label decisions.

## Imperative shell

`src/application/preview.ts` exposes the assessment use case. It accepts a snapshot, a public-post reader, and a destination resolver. It retrieves the submitted post and at most one quoted post, resolves supported shortened links, then calls the pure core. Each assessed link carries its direct or quoted origin. The webpage and tests call this same operation.

The Bluesky adapter translates a post embed into a typed quote reference or an unavailable quote. Feed and other non-post embeds are not quote references. Blocked, missing, and detached quote views do not become fetchable references. The use case preserves direct results when a quote cannot be fetched and never recursively follows the quoted post's own quote.

`src/adapters/` translates Bluesky records, resolves redirects, stores rating snapshots, and serves HTTP. The redirect adapter validates public IP addresses and connects to the validated DNS answer, preventing a second DNS lookup from changing the destination. Each resolution has one deadline and a hop limit.

`src/web/` renders escaped HTML and handles the form's busy state. `src/main.ts` wires the adapters and starts the loopback-only server. Post assessments are transient; the only durable data is the rating snapshot and its staged update metadata.

## Snapshot ownership

The lock file is the source of truth for the selected dataset revision. Cached CSV files are keyed by their content digest and checked before use. An update check stages a candidate and reports differences; adoption atomically replaces the lock. A running preview keeps the snapshot it loaded until restarted.

## Test strategy

Application scenarios substitute post retrieval and redirect resolution at their I/O seams while exercising real domain logic. Focused adapter tests verify foreign record formats, invalid data, private destination rejection, redirect limits, filesystem state, and HTTP isolation. One browser smoke test checks the visible assessment flow, attribution, mobile access to the form, and recovery from errors.

The local preview has no publication state or outbox. Those belong to the later public labeler, where durable decisions, corrections, and recovery will need their own use cases and tests.
