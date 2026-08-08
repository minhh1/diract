-- One-off data fix, not a schema change: restores Niksen Time Pty Ltd's
-- (32d4fb0e-007d-41e7-bc5e-638163c28e3d) invoice_settings/table_label_
-- overrides to their exact pre-testing values. A live smoke test of
-- install_company_template's new settings extra (this migration series)
-- was run against this real company without snapshotting its settings
-- first, and its invoice_settings.templates/table_label_overrides got
-- overwritten by test data pulled from Huynh Lawyers. The values restored
-- below were captured directly from this same company earlier in the same
-- session, before any of this feature's testing began.
UPDATE companies SET
  invoice_settings = '{
    "templates": [
      {
        "id": "196cdd59-893d-4f84-a347-09c375a6f7bb",
        "name": "Detailed",
        "style": "detailed",
        "display": {
          "showDueDate": true,
          "showFeeSubtotal": true,
          "showRatePerLine": false,
          "showHoursPerLine": true,
          "showPriorBalance": false,
          "showStaffInitials": true,
          "showAccountSummary": false,
          "showPaymentSummary": true,
          "showLineDescriptions": true,
          "showAmountAndGstPerLine": true,
          "showDisbursementSubtotal": true
        },
        "isDefault": true
      }
    ],
    "otherTerms": "",
    "bankDetails": null,
    "creditTerms": "",
    "firmAddress": "",
    "paymentTermsDays": 14
  }'::jsonb,
  table_label_overrides = '{}'::jsonb
WHERE id = '32d4fb0e-007d-41e7-bc5e-638163c28e3d';

-- Clean up the rest of this same smoke test's artifacts on that company.
DELETE FROM client_update_page_fields WHERE page_id = '65bc7b7c-8b2f-498f-b59d-999429d46912';
DELETE FROM client_update_pages WHERE id = '65bc7b7c-8b2f-498f-b59d-999429d46912';
DELETE FROM company_template_installs WHERE id = 'bfcac3b2-8a75-408b-a32f-735ea41efbd7';

-- And the throwaway draft templates created on Huynh Lawyers for this
-- session's RPC smoke tests (cascades their child rows).
DELETE FROM template_definitions WHERE id IN ('6b7616d8-9336-4f7a-85f3-8ee8bfbf0c93');
