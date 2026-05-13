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
          "entry_into_force": "2016-12-03"
        }
      ]
    }
  ]
}
```
