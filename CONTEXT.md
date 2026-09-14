# News Quality

News Quality describes the quality of sources linked from Bluesky posts using published domain and section ratings.

## Language

**Local preview**:
A private assessment showing source ratings and any proposed labels before publication to Bluesky.
_Avoid_: Published label

**Source rating**:
The dataset's numerical quality score for a domain or a section of a site. It describes the source, not the accuracy of an individual article.
_Avoid_: Truth score, article rating

**Post label set**:
The distinct source-quality categories attached to a post, with one label per category represented by its eligible linked sources. It is not a combined rating of the post.
_Avoid_: Overall post rating

**Manual publication**:
An operator's explicit action to publish a reviewed post label set to the labeler service.
_Avoid_: Automatic labeling

**Retraction**:
Withdrawal of a previously published label. It does not assert the opposite source-quality category.
_Avoid_: Inverse rating

**Unmatched domain**:
A linked domain for which no corresponding rating is found in the selected dataset.
_Avoid_: Low-quality source

**Source quality category**:
One of “Low quality news source”, “Medium quality news source”, or “High quality news source”, assigned from the unrounded source rating using a versioned project policy. The local preview uses the provisional `source-quality-v1` policy in `src/labeling/quality-policy.ts`; the paper does not validate these categories.
_Avoid_: Article verdict

**Matched source entry**:
The domain or section entry in the dataset that supplies a link's source rating. It may be an exact section, an exact hostname, or a parent domain permitted by the matching policy.
_Avoid_: Linked hostname when referring to the dataset entry

**Section rating**:
A source rating scoped to a path within a site, such as `example.com/news`. It does not describe the entire site.
_Avoid_: Site-wide rating

**Unresolved destination**:
A linked URL whose destination source could not be established. This does not establish whether that source has a rating in the dataset.
_Avoid_: Unmatched domain

**Rating snapshot**:
A fixed version of the domain ratings used for an assessment. Its identity makes the underlying ratings traceable across dataset updates.
_Avoid_: Latest ratings

**Quoted post**:
A Bluesky post embedded by the submitted post. Its direct links can supply source ratings, but its own quoted posts are outside the preview's inspection scope.
_Avoid_: Reply, linked article

**Link origin**:
Whether an assessed link belongs to the submitted post or its quoted post. This distinction is preserved even when both posts link to the same source.
_Avoid_: Author endorsement
