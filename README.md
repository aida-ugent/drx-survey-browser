# DRX Browser

**The State-of-the-Art in Explanation Methods for Two-Dimensional Embeddings**

Edith Heiter, Fuyin Lai, Cyril de Bodt, Yvan Saeys, Jefrey Lijffijt

A filterable gallery of the survey's papers: search by title/abbreviation, filter by year range, code availability, and ten categorical fields (task, target, DR requirements, input data, output format, complexity control, interactive, layout enrichment, evaluation approach, evaluation measures), and sort by abbreviation or year.

## Running locally

Browsers block `fetch()` of local JSON files when a page is opened directly (`file://`), so serve the folder instead of double-clicking `index.html`:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

## Data

Paper metadata comes from `website_table.csv`, converted to `papers/*.json` by `scripts/build_data.py`. 

## Inspiration

- [dr-reliability.github.io/demo](https://dr-reliability.github.io/demo/)
- [VA+Embeddings Browser](https://va-embeddings-browser.ivis.itn.liu.se/)
- [sarah37/filterable-collection](https://github.com/sarah37/filterable-collection)
