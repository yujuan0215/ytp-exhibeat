# Artemperor Crawl + Vectorize

This folder documents the two scripts used for:

1. Crawling Artemperor tidbits data
2. Chunking + embedding the crawled JSON for RAG

---

## 1) Crawl script

Script path:

- `../crawl_artemperor.py`

What it does:

- Opens `https://artemperor.tw/tidbits`
- Filters list boxes by location keyword (default `台北市`)
- Enters matched items
- Clicks read-more if available
- Extracts:
  - `title`
  - `date` 
  - `location` 
  - `author` 
  - `full_text`
  - `image`
  - `related_link`
- Writes JSON output

Run examples (from project root `crawl/`):

```bash
python crawl_artemperor.py
```

```bash
python crawl_artemperor.py --max-items 10 --location 台北市 --output artemperor_db.json
```

```bash
python crawl_artemperor].py --max-items 5 --headless
```

CLI args:

- `--max-items` how many items to crawl (default: `5`)
- `--location` location keyword filter (default: `台北市`)
- `--output` output JSON path (default: `artemperor_tidbits_taipei_top5.json`)
- `--headless` run browser without GUI

---

## 2) Vectorize script

Script path:

- `vectorize_artemperor.py`

What it does:

- Loads crawler JSON (or a direct list of item objects)
- Builds LangChain `Document` objects from `full_text` + metadata
- Splits text using LangChain `RecursiveCharacterTextSplitter`
- Generates embeddings
  - preferred: Gemini (`models/gemini-embedding-001`) when `GOOGLE_API_KEY` is set
  - fallback: OpenAI when `OPENAI_API_KEY` is set
  - local deterministic fallback when no API key is set
- Writes chunked vector JSON

Run examples (from project root `crawl/`):

```bash
python crawler/vectorize_artemperor.py --input artemperor_tidbits_taipei_top5.json --output artemperor_tidbits_taipei_top5_chunks.json
```

```bash
python crawler/vectorize_artemperor.py --input artemperor_tidbits_taipei_top10.json --output artemperor_top10_chunks.json --chunk-size 1000 --chunk-overlap 120
```

```bash
python crawler/vectorize_artemperor.py --input artemperor_tidbits_taipei_top10.json --output artemperor_top10_chunks_preview.json --max-chunks 50
```

CLI args:

- `--input` input JSON file path
- `--output` output chunk JSON file path
- `--chunk-size` max chars per chunk (default: `1200`)
- `--chunk-overlap` overlap chars between chunks (default: `180`)
- `--max-chunks` cap output chunk count (`0` means unlimited)

---

## Environment Variables

For Gemini embeddings:

```bash
set GOOGLE_API_KEY=your_key_here
```

For OpenAI fallback embeddings:

```bash
set OPENAI_API_KEY=your_key_here
```

If neither key is set, the script uses deterministic local embeddings for pipeline testing.
