# Automatic labeling

An enabled Render deployment listens for new public Bluesky posts and publishes source-quality labels automatically. Subscribers see the labels on those posts in their normal Bluesky feeds. The operator page remains available for inspection and retraction; entering each post there is no longer required.

## Processing contract

The consumer uses the [Jetstream JSON subscription](https://bsky.network/docs/jetstream/) for `app.bsky.feed.post` commits, with the `xrpc.v1.json` subprotocol. It starts at the live tip on first launch. It trusts Bluesky's public Jetstream service to report record contents and CIDs; it does not independently verify repository proofs. Direct links are assessed from the supplied record without requesting each post through AppView. Quoted posts use the existing public reader.

The same pinned ratings, section matching, shortener resolution, and category policy apply to automatic and manual assessments. Unmatched links receive no quality category. A quote contributes its direct links only. Unavailable quotes and unresolved shorteners leave any direct source results intact, as in manual preview.

Create events with a matching source, a supported shortener, or a quote enter a durable queue. Updates and deletions also enter the queue so earlier labels can be withdrawn. Queued revisions of the same post coalesce to the newest event. A post revision receives its category set once. A changed revision replaces the previous labels, and deletion retracts the latest set. Every decision records its manual or automatic origin. A manual retraction owns its revision: replay cannot republish that same revision. An automatic deletion allows an identical post to be recreated and labeled again. Existing decisions migrate to manual origin on startup.

The publication service remains the single writer for manual and automatic decisions. It saves an operation before delivery, finishes pending delivery before another decision for that post, and retries interrupted automatic work. Label history and evidence remain durable in `labels.db`. The operator page shows a bounded page of decisions, with an Older decisions link for earlier pages. Retraction controls remain available for older active decisions, even if the post is no longer public.

## Restart and overload

`automatic.db` stores the queue and stream cursor in the same transaction. Acknowledging a job only removes that exact revision, so an edit arriving during processing survives. Reconnect uses the last durably accepted sequence number; inclusive replay is harmless. Workers finish accepted jobs after restart, including any publication whose acknowledgement was interrupted.

Intake closes its connection if it cannot save work or the bounded queue fills, then reconnects from the saved cursor while workers drain the backlog. Four workers share the publisher, with one active job per post. Connection failures and publication failures retry with a delay. Malformed post records are skipped without blocking later valid posts; an unexpected stream envelope stops intake and is reported as a connection error.

The public stream has a bounded replay window. If an outage exceeds that window, the saved cursor can be rejected. The service reports reconnection failure instead of silently jumping ahead. Recovery then requires an operator decision about historical replay or starting from a new live position. This consumer does not perform archive backfills.

## Deployment and verification

Merge and deploy the automatic-labeling change to the existing Render service. With `LABELER_ENABLED=true`, automatic processing starts by default; no extra service or signing key is needed. Set `LABELER_AUTOMATIC=false` and deploy to pause intake and workers while keeping the operator and existing labels available. Re-enable by setting it to `true`.

Check `/healthz`. `status: ready` describes label-serving readiness. The separate `automatic` object reports stream state, durable cursor, queue length, and process-local completed-job/failure counts. A temporarily disconnected upstream does not make Render restart an otherwise healthy label-serving service. Check that the cursor advances and the queue drains; `processed` includes jobs with no matching labels. Failures include a timestamp and a generic server log entry, without post contents or secrets.

For live acceptance:

1. From a separate Bluesky account, subscribe to `news-quality.bsky.social` and enable the informational categories.
2. Create a test post linking to a rated news source. Keep its Bluesky post URL.
3. Wait for intake and publication; inspect the operator history or the public label query endpoint for that post URI.
4. View the post from the subscribed account and confirm the label appears without blurring it.
5. Retract its labels in the operator page and confirm they disappear after propagation. Reconnection must not undo that retraction.

Local tests establish queue, assessment, publication, restart, and connection behavior. Live subscriber display still depends on the labeler account's declared service URL, signing key, label definitions, and Bluesky ingestion.

## Coverage and storage limits

This labels new posts observed after initial activation, plus replay available after a reconnect. It does not backfill old feed posts, label a pre-existing post merely because somebody reposts it, or reclassify existing posts when a quoted post or the rating dataset changes. Transient quote/shortener lookup failures follow the existing partial-assessment policy; they do not schedule an additional reassessment.

The queue is bounded, but signed label history and publication evidence accumulate. Monitor Render disk usage and grow the persistent disk before it fills. There is no automatic history deletion. Back up the entire state directory while the process is stopped, including `labels.db`, `automatic.db`, and their WAL companions, and keep the signing key separately. Run one Render instance with that disk.
