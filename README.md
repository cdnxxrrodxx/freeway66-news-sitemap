# freeway66-news-sitemap

Generates one `news-sitemap.xml` from published Freeway66 Webflow News and
Trending News items.
GitHub Actions runs daily at 12:00 UTC and can be started manually.

Requires Node.js 22+ and the existing `WEBFLOW_TOKEN` environment variable
(GitHub Actions secret). No npm dependencies are needed. For local use, Node
can load an existing environment file with `node --env-file=.env index.js`.
Never commit API tokens.

Run tests with `node --test`; generate with `node index.js`.

Collection configuration lives in `COLLECTIONS` in `index.js`:

| Collection | Collection ID | Article path | Date field |
| --- | --- | --- | --- |
| News | `677c5483872e84e4fa358f56` | `/news/` | API slug `published-date` |
| Trending News | `677c5483872e84e4fa358f64` | `/trending-news/` | DateTime field named `Custom Published Date` |

The existing workflow token must have CMS read access to both collections in
the client's Webflow site. It is independent of any Webflow account connected
to Codex. Trending News's API date slug is resolved from the collection schema
on each run, because its display name alone does not establish its API slug.
A missing or ambiguous matching field fails generation.

The News date field API slug is `published-date`, observed in the live workflow's
available field keys. Each collection's date controls both the 48-hour selection window
and the XML publication date. Future dates, drafts, archived items, and items
whose `shareable-draft` field is true are excluded. Titles use the CMS name.

Like the Heavyweight Boxing generator, a missing or invalid custom date on any
otherwise eligible published item fails generation, including older articles.
The error lists field keys to help diagnose an incorrect slug without printing
article values or credentials. There is no fallback to Webflow's lastPublished.
API and validation failures leave the existing sitemap untouched.
Both collections must succeed before the combined sitemap is written. If the
combined count exceeds Google's 1,000-news-entry limit, generation fails and
preserves the existing file; automatic splitting is not implemented.

For the first live validation, run the workflow manually after pushing the
change. Check the field diagnostics if it fails, then verify generated dates
against CMS articles. Finally verify the XML at
https://newssitemap.freeway66.com/news-sitemap.xml matches the generated file;
the repository's Pages deployment settings still need verification.
