# Sources for the built-in example

Retrieved from doi.org on 2026-11-06 (Asia/Taipei) with `Accept: application/vnd.citationstyles.csl+json`.
Content negotiation on doi.org redirects to the registration agency's metadata service:
Crossref DOIs to `api.crossref.org`, DataCite DOIs to `data.crosscite.org`.

| key | DOI | Registered title | First author | Registered year | Agency |
|---|---|---|---|---|---|
| lecun2015 | 10.1038/nature14539 | Deep learning | LeCun | 2015 (issued 2015-05-27; print 2015-05-28) | Crossref |
| he2016 | 10.1109/CVPR.2016.90 | Deep Residual Learning for Image Recognition | He | 2016 | Crossref |
| vaswani2017 | 10.48550/arXiv.1706.03762 | Attention Is All You Need | Vaswani | 2017 | DataCite |
| hochreiter1997 | 10.1162/neco.1997.9.8.1735 | Long Short-Term Memory | Hochreiter | 1997 (issued 1997-11-01) | Crossref |
| goodfellow2016 | none | (book, no DOI used) | Goodfellow | 2016 | n/a |
| phantom2026 | 10.1145/haunted-ink.unresolved.2026 | **fictional, intentional** | n/a | n/a | none |

## Intentional problems
- `hochreiter1997`: the year is entered as 1998 on purpose. The registered year is 1997, so a check shows Mismatch.
- `phantom2026`: fictional work with an unregistered DOI. On 2026-11-06 the Handle API answered `responseCode` 100. A check shows Not found.
- `goodfellow2016`: no DOI, shows No DOI.

## Behaviour
Loading the example leaves every reference **unchecked**. The table above records what was retrieved on the date shown; it is not a stored verification. Only a check run in the app against doi.org produces a status.
