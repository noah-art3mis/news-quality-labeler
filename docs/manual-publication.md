# Manual publication pilot

## Agreed scope

The first publisher is operator-driven. Paste a public Bluesky post URL, inspect its proposed labels and source evidence, then explicitly publish the labels. Support retracting published labels and verify the subscriber experience in Bluesky. Automatic ingestion is a later stage.

Keep the existing category policy and post-label rules: one label per distinct category across direct sources and one quoted post, no combined score, and no categories for unmatched or unresolved destinations.

## Design work

Publication introduces durable state beyond the current preview's rating cache. Preserve the evidence and policy behind a publication, distinguish a local proposal from a published label set, and make retries and retractions recoverable. Choose storage and delivery boundaries after inspecting the publisher library's actual transaction and retry behavior.

Evaluate `@skyware/labeler` as the protocol adapter. Its documented service signs and stores labels, exposes the labeler endpoints, and supports retraction through negation. Keep classification and publication decisions independent of this adapter. See the [upstream setup guide](https://skyware.js.org/guides/labeler/introduction/getting-started/) and the [AT Protocol label specification](https://atproto.com/specs/label).

Public operation requires a labeler identity and signing key, declared labels, and a reachable HTTPS service. Account setup, hosting, and live publication have not been performed.

## Open product decision

Choose the subscriber-facing behavior of the three categories: informational labels with no content blurring or hiding, or stronger warning/filter defaults. Recommended starting behavior is informational for all categories, since they describe sources rather than individual article verdicts.
