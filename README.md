# \\/ertelligence Law and Policy Ingest

A component for ingesting law and policy data into a Vertelligence platform.

```json
{
  "jurisdictions": [
    {
      "public_id": "KOR",          // optional
      "name": "Republic of Korea", // required if public_id absent
      "agreements": [
        {
          "name": "Paris Agreement",
          "description": "…",
          "year": "2015",
          "date_accepted": "2016-11-04",
          "entry_into_force": "2016-12-03",
          "citation": "UN Treaty Collection" // optional
        }
      ]
    }
  ]
}
```

`citation` is optional and cites the law on its row, so it needs a law `name`. The receiving
service matches it by name or creates it, and records it only when the row creates that law. For a
law already in the database it is ignored, since the stored text keeps the source of its first
submission. A blank citation is ignored.

Law names are matched ignoring case, so "sb 261" is the same law as "SB 261". A new law keeps the
case it is first given.
