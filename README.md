# News Quality

News-source ratings for links shared on Bluesky.

News Quality Labeler is a planned Bluesky labeler that annotates posts using published news-domain quality ratings from [hauselin/domain-quality-ratings](https://github.com/hauselin/domain-quality-ratings).

## How it will work

1. Extract external URLs from Bluesky posts.
2. Match their domains against a versioned copy of the ratings dataset.
3. Map matched ratings to documented label categories.
4. Publish labels on the posts for subscribers to the labeler.

The dataset's `pc1` score runs from 0 (lowest quality) to 1 (highest quality). It describes the source domain, not the truth of an individual article or the views of the person sharing it. Domains absent from the dataset will remain unlabeled. Label thresholds have not yet been selected.

## Status

Project setup only. No running labeler or application code yet.

## Data and methodology

The upstream [data documentation](https://github.com/hauselin/domain-quality-ratings/tree/main/data) describes the available ratings. This repository does not currently redistribute the dataset.

Lin, H., Lasser, J., Lewandowsky, S., Cole, R., Gully, A., Rand, D. G., & Pennycook, G. (2023). [High level of correspondence across different news domain quality rating sets](https://doi.org/10.1093/pnasnexus/pgad286). *PNAS Nexus*, 2(9).
