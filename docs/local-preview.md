# Local preview

## Agreed scope

Build the local preview first. Public label publication and the subscriber experience belong to a later stage.

The user opens a local webpage, pastes a Bluesky post URL, and sees its linked domains and ratings.

For each linked domain, show its numerical source rating and the dataset version. Show “Not in dataset” for unmatched domains. The first preview shows numerical ratings; category thresholds will be chosen after inspecting examples.

The planned category labels are “Low quality news source”, “Medium quality news source”, and “High quality news source”. These describe the linked source rather than the accuracy of the article or the views of the person sharing it.

Inspect only links directly attached to the submitted post. Do not inspect links inside quoted posts in the first version. When a quoted post is present, show a visible note that it has not been inspected.

Match the linked hostname exactly first. If no exact rating exists, allow inheritance from a rated parent domain for ordinary publisher subdomains. Keep independently operated sites on shared hosting distinct. Show the dataset domain that supplied each rating. The mechanism for identifying shared-hosting boundaries still needs investigation.

Resolve shortened URLs to identify their destination source, with bounded redirect counts and waiting time. If resolution fails, show “Could not resolve destination”, distinct from “Not in dataset”.

Use a pinned dataset version. Adopt updates only through an explicit update command, allowing rating changes to be inspected before adoption. Show the dataset version in the preview so assessments can be reproduced against the same ratings.

Place an “About these ratings” link beside the results. It opens the paper citation, the dataset repository, and the exact dataset version used. Explain that ratings describe source domains rather than individual articles. Keep both references in the README as well.

For posts linking to multiple sources, show one result per matched source domain with its rating and associated links. Do not calculate a combined score for the post.

Do not save assessment history in the first version. Show the current assessment and discard it when the user leaves. The pinned rating snapshot remains available independently of assessment history.

Use public Bluesky access without login. If the submitted post is deleted or unavailable publicly, show a clear error. The first version requires no Bluesky account credentials.

## Decisions still to resolve

- How shared-hosting boundaries are identified for parent-domain matching.

The implementation design remains a proposal while these product decisions are being discussed.
