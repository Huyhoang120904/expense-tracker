function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Render an interactive Scalar API Reference page for the given OpenAPI spec URL. */
export function renderOpenApiDocsHtml(options: {
  title: string;
  specUrl: string;
}): string {
  const safeTitle = escapeHtml(options.title);
  const safeSpecUrl = escapeHtml(options.specUrl);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="${safeSpecUrl}"
    ></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>
`;
}
