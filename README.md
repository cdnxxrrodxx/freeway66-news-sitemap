# freeway66-news-sitemap

Generates `news-sitemap.xml` from published Freeway66 Webflow news items.
GitHub Actions runs daily at 12:00 UTC and can be started manually.

Requires Node.js 22+ and the existing `WEBFLOW_TOKEN` environment variable
(GitHub Actions secret). No npm dependencies are needed. For local use, Node
can load an existing environment file with `node --env-file=.env index.js`.
Never commit API tokens.

Run tests with `node --test`; generate with `node index.js`.

The assumed date field API slug is `custom-published-date` (not yet verified
against the client's live API). It controls both the 48-hour selection window
and the XML publication date. Future dates, drafts, archived items, and items
whose `shareable-draft` field is true are excluded. Titles use the CMS name.

Like the Heavyweight Boxing generator, a missing or invalid custom date on any
otherwise eligible published item fails generation, including older articles.
The error lists field keys to help diagnose an incorrect slug without printing
article values or credentials. There is no fallback to Webflow's lastPublished.
API and validation failures leave the existing sitemap untouched.

For the first live validation, run the workflow manually after pushing the
change. Check the field diagnostics if it fails, then verify generated dates
against CMS articles. Finally verify the XML at
https://newssitemap.freeway66.com/news-sitemap.xml matches the generated file;
the repository's Pages deployment settings still need verification.
