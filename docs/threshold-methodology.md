# What PC1 can support

The proposed categories should describe positions on a source-quality scale. They must not imply probabilities of truth, measured article accuracy, or agreement by the original authors with our cutoffs. The pinned data dictionary defines `pc1` as the first PCA component, with 0 the lowest and 1 the highest quality; neither README supplies category boundaries. [`data/README.md`, revision `5671d57`](https://github.com/hauselin/domain-quality-ratings/blob/5671d57e545e48225ef2cbf559a6ab7f8f77a9de/data/README.md).

Lin et al. normalize inputs separately and impute missing values. Public PC1 excludes NewsGuard from PCA, although imputation uses its ratings. The paper warns that scales are not interchangeable, so NewsGuard's 0.60 boundary cannot simply be transferred. It calls Daily Kos (0.41) lower quality and Daily Caller (0.47) and MSNBC (0.59) medium quality, but specifies no exhaustive three-band rule. [Paper, Results and Methods](https://academic.oup.com/pnasnexus/article/2/9/pgad286/7258994).

The supplement examines alternative PCA inputs and simulated missingness. Simulated reconstructed PC1 correlates 0.64 with complete-data PC1 under random missingness and 0.73 under the observed missingness pattern. These assess aggregate recovery, not per-source confidence intervals or classification error at a cutoff. No low/medium/high mapping appears in its text. [Supplementary information, Figures S6–S8](https://academic.oup.com/pnasnexus/article/2/9/pgad286/7258994#supplementary-data).

## Proposed policy, not an author recommendation

A transparent starting candidate is **low: `pc1 < 0.40`; medium: `0.40 ≤ pc1 < 0.70`; high: `pc1 ≥ 0.70`**. These are deliberately rounded operational boundaries that reserve low and high for the outer score ranges and leave a substantial middle. They are not quantiles, natural clusters, or empirically established points where journalistic quality changes. They also do not reproduce every qualitative example in the paper. This candidate is defensible as a disclosed convention for a preview, not as a scientifically calibrated classification.

Choose final boundaries by deciding what practical claim each label should make and examining its consequences across the full pinned dataset. Do not move boundaries until familiar brands land where expected. Counts, quantiles, and example sources reveal consequences; they cannot establish that a cutoff is correct. Equal-frequency bins would instead describe relative rank within this particular collection and could shift simply because coverage changes.

For public use, validate against a separately assembled, contemporaneous set of source assessments with an explicit quality rubric and reviewers unaware of PC1. Include geographic and language variation, sources near boundaries, and different coverage levels. Decide in advance which mistakes matter most, then evaluate candidate cutoffs on held-out sources. Reusing input ratings as the only reference would measure agreement with ingredients already contributing to PC1, not independent validity.

Before selecting a policy, compare nearby boundary alternatives and report how many sources change category. Near-boundary switches should be described as sensitivity to policy, not evidence that a source changed. Compare unrounded scores; retain the numerical score, matched entry, policy version, and snapshot identifier beside any category. Missing matches remain outside all three bands.

## Coverage and age

The paper combines uneven, overlapping coverage; several input inventories are dated November 2022. It excludes twelve platform or aggregator domains from subsequent analyses. It also acknowledges shared rater biases and variation among articles within one domain. [Paper, Results, Discussion and Methods](https://academic.oup.com/pnasnexus/article/2/9/pgad286/7258994).

Consequently, treat the pin as reproducible historical evidence, not a current re-review of every source. A download or commit date alone does not establish rating freshness. Preserve domain and section scope, report absence as unknown, and avoid claiming universal language or regional coverage without measuring it. A source-level category cannot determine whether a particular linked article is accurate; it should support context and scrutiny rather than substitute for article-level assessment.
