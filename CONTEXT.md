# News Quality

News Quality describes the quality of sources linked from Bluesky posts using published domain ratings.

## Language

**Local preview**:
A private assessment showing source ratings and any proposed labels before publication to Bluesky.
_Avoid_: Published label

**Source rating**:
The dataset's numerical quality score for a domain. It describes the source, not the accuracy of an individual article.
_Avoid_: Truth score, article rating

**Unmatched domain**:
A linked domain for which no corresponding rating is found in the selected dataset.
_Avoid_: Low-quality source

**Source quality category**:
One of “Low quality news source”, “Medium quality news source”, or “High quality news source”, assigned from a source rating using agreed thresholds.
_Avoid_: Article verdict

**Matched source domain**:
The domain entry in the dataset that supplies a linked hostname's source rating. It may be an exact match or a parent domain permitted by the matching policy.
_Avoid_: Linked hostname when referring to the dataset entry

**Unresolved destination**:
A linked URL whose destination source could not be established. This does not establish whether that source has a rating in the dataset.
_Avoid_: Unmatched domain

**Rating snapshot**:
A fixed version of the domain ratings used for an assessment. Its identity makes the underlying ratings traceable across dataset updates.
_Avoid_: Latest ratings
