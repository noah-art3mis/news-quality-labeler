# Manual publication pilot

## Agreed scope

The first publisher is operator-driven. Paste a public Bluesky post URL, inspect its proposed labels and source evidence, then explicitly publish the labels. Support retracting published labels and verify the subscriber experience in Bluesky. The manual workflow remains available alongside [automatic ingestion](automatic-labeling.md).

Keep the existing category policy and post-label rules: one label per distinct category across direct sources and one quoted post, no combined score, and no categories for unmatched or unresolved destinations.

## Design work

Publication introduces durable state beyond the current preview's rating cache. Preserve the evidence and policy behind a publication, distinguish a local proposal from a published label set, and make retries and retractions recoverable. A durable operation records the intended label changes before delivery. The adapter recognizes already saved events when recovering from a crash before acknowledgement. Decisions for a post are serialized, and an unfinished operation must be retried before a new decision.

Use `@skyware/labeler` as the protocol adapter. Its documented service signs and stores labels, exposes the labeler endpoints, and supports retraction through negation. Keep classification and publication decisions independent of this adapter. See the [upstream setup guide](https://skyware.js.org/guides/labeler/introduction/getting-started/) and the [AT Protocol label specification](https://atproto.com/specs/label).

Public operation requires a labeler identity and signing key, declared labels, and a reachable HTTPS service. See [publisher-setup.md](publisher-setup.md) for configuration and public verification. Account setup and live subscriber verification follow that runbook.

## Subscriber display

All three categories use informational severity, no blurring, and no default hiding. The protocol default preference is `warn`, which makes an informational label visible; subscribers control their own preferences. See `data/label-definitions.json` for the declarations.
