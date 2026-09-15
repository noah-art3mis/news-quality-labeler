# News Quality

News-source ratings for links shared on Bluesky.

Paste a public Bluesky post URL into a local webpage to inspect its linked sources using [published domain-quality ratings](https://github.com/hauselin/domain-quality-ratings). Results show each source's numerical rating and provisional quality category, the matched domain or section, and the dataset revision used.

The default mode is a local preview that does not publish labels or require a Bluesky account. An optional manual publisher adds explicit publication and retraction after labeler account and hosting setup. The local categories are **Low quality news source** (below 0.40), **Medium quality news source** (0.40 to below 0.70), and **High quality news source** (0.70 and above). They use the unrounded score; unmatched and unresolved links remain unclassified.

The **Proposed post labels** section shows each distinct category once for the submitted post, including categories from one quoted post. A post can receive both low and high labels when it shares sources from both categories; scores are never averaged. Individual source results retain the supporting links and their origins. See [the post-label rules](docs/post-label-preview.md).

The [threshold analysis](docs/threshold-analysis.md) compares candidate cutoffs against the pinned dataset, with a distribution chart, recognizable examples, and methodological limits. The local preview uses the provisional project policy `source-quality-v1`, defined in [quality-policy.ts](src/labeling/quality-policy.ts). These cutoffs are not validated by the paper.

## Run locally

Requires Node.js 24 or newer and npm.

```sh
npm ci
npm start
```

Open **http://localhost:4317**. On first startup, the app downloads the pinned CSV and verifies its checksum. Subsequent starts use the local dataset cache. Public post retrieval and shortened-link resolution require internet access.

The server listens only on the local machine. It keeps no assessment history and sends no credentials. The dataset cache is stored in `.cache/ratings/`; it contains ratings, not inspected posts. The optional manual publisher is described below; continuous ingestion remains future work.

## Manual publisher

For hosted operation, follow the [Render setup guide](docs/render.md). The included blueprint configures a paid service with persistent storage and a password-protected operator page. Start in setup mode to obtain your HTTPS URL, then register the Bluesky labeler and enable publishing.

See [publisher setup](docs/publisher-setup.md) for the dedicated account, signing key, HTTPS service, label declarations, and subscriber verification. With those configured, `npm run start:publisher` adds Publish, Retry, and Retract controls to the private operator page. Labels use informational display with no default blurring or hiding.

Publication decisions and source evidence are saved in a durable SQLite database. Repeated submissions are idempotent; changed reviews require reinspection; partial delivery can be retried after restart. Acceptance by the labeler service does not by itself establish that Bluesky displayed the label.

## How matching works

- Extract links from the post's rich-text facets and its own website-card embed, plus the direct links in one quoted post. Mark those links **Source from quoted post**. Deeper quotes are not followed, and unavailable quotes leave direct results intact with a notice.
- Prefer the longest section match on the same hostname, then an exact hostname rating, then an allowed parent-domain rating. `/news` matches `/news/article`, not `/newsletter`.
- Keep independently operated subdomains distinct using public-suffix rules and supplemental publishing-platform boundaries.
- Group links by their matched source entry. There is no combined post score.
- Show **Not in dataset** for unmatched domains and **Could not resolve destination** for failed short-link resolution.

Known shortener hosts are listed in [host-policy.ts](src/labeling/host-policy.ts). Other URLs are matched directly without fetching the article. Redirect resolution uses HTTP headers, with a time and hop limit; JavaScript redirects and unlisted shorteners are not expanded. Private network destinations are blocked. Section ratings apply only on their exact hostname; they are not inherited by subdomains.

The score runs from 0 (lowest quality) to 1 (highest quality). It describes the source, not the truth of an individual article or the views of the person sharing it. Displayed scores are rounded to three decimal places; matching retains the original values.

## Dataset updates

[data/ratings.lock.json](data/ratings.lock.json) pins the upstream commit and CSV checksum. Startup never adopts a newer revision automatically.

```sh
npm run ratings:fetch  # Download or verify the pinned snapshot
npm run ratings:check  # Stage the upstream revision and print rating changes
npm run ratings:adopt  # Explicitly adopt the staged revision
```

Inspect the check output before adoption. Restart the preview afterward, and commit the changed lock file if the new pin should be shared. Dataset files are downloaded from upstream rather than redistributed in this repository.

## Development

```sh
npm test
npm run typecheck
npx playwright install chromium
npm run test:browser
```

To use an existing Chrome installation instead, set `CHROME_BIN` to its executable when running the browser test. The single browser smoke test uses synthetic posts and ratings, exercises the webpage, and saves desktop and mobile screenshots under `test-results/`. Application tests use real matching logic; integration tests cover Bluesky translation, CSV validation, snapshot adoption, redirects, and the localhost HTTP interface.

See [CONTEXT.md](CONTEXT.md) for domain terminology, [the agreed scope](docs/local-preview.md), and [the architecture](docs/architecture.md).

## Data and methodology

The [dataset documentation](https://github.com/hauselin/domain-quality-ratings/tree/main/data) explains the available ratings. The webpage's **About these ratings** section links to the paper, the repository, and the exact snapshot used for an assessment.

Lin, H., Lasser, J., Lewandowsky, S., Cole, R., Gully, A., Rand, D. G., & Pennycook, G. (2023). [High level of correspondence across different news domain quality rating sets](https://doi.org/10.1093/pnasnexus/pgad286). *PNAS Nexus*, 2(9).
