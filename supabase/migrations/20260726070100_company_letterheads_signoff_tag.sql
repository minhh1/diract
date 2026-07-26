-- Third auto-inserted letterhead tag: the signoff block (bold name +
-- position/company/contact details for each selected signer, see
-- lib/precedents/signoffXml.ts) is spliced in as raw formatted OOXML rather
-- than plain docxtemplater text -- {{content}}'s flat-text substitution
-- can't make just the name bold within one tag. Existing letterheads (there
-- shouldn't be real ones yet, this feature just shipped) won't have this tag
-- until re-uploaded; the issue route treats a missing signoff_tag_key match
-- as "no signoff block for this letterhead" rather than erroring.
ALTER TABLE company_letterheads ADD COLUMN IF NOT EXISTS signoff_tag_key text NOT NULL DEFAULT 'signoff';
