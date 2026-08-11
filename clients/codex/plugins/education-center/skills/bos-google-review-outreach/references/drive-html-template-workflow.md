# Drive review sequence

Use the single Drive folder configured by the Google Drive plugin. Place one
manifest named `review-outreach-sequence.json` in that folder:

```json
{
  "schema_version": "review-outreach-sequence/v1",
  "sequence": [
    {"step": 1, "email_template": "review-email-1.html", "sms_template": "review-sms-1.txt"},
    {"step": 2, "email_template": "review-email-2.html", "sms_template": "review-sms-2.txt"},
    {"step": 3, "email_template": "review-email-3.html", "sms_template": "review-sms-3.txt"}
  ]
}
```

The run pins the manifest and all six file IDs/checksums. Later Drive edits
apply to later campaigns. A checksum change blocks delivery for an active
campaign.

HTML may use validated same-folder images with `data-drive-asset`. BOS converts
them to SendGrid inline attachments. Templates support simple allowlisted
variables, including `first_name` and `review_confirmation_url`. Unresolved
variables, traversal, missing assets, unsafe filenames, invalid MIME types, and
oversized content fail before provider effects.

The client selects no Drive folder or filenames during a run. Configure the
folder once in the Drive plugin and edit templates through Drive.
