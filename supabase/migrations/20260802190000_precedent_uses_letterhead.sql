-- Not every precedent belongs on the firm's letterhead.
--
-- The issue pipeline (lib/precedents/issuePrecedent.ts) composes every
-- document into company_letterheads -- correct for letters and advices, wrong
-- for everything else. A statement of claim carries its own prescribed
-- heading (Form 3A: COURT DETAILS / TITLE OF PROCEEDINGS / FILING DETAILS)
-- and is filed, not sent; putting the firm's letterhead art above that is not
-- the approved form. The same goes for deeds, which are standalone
-- instruments executed by the parties, and for prescribed forms generally.
--
-- Default true so existing behaviour is unchanged for anything already in a
-- firm's library, then corrected below for the document types that are never
-- letterhead documents. It stays a column rather than being derived from
-- document_type at read time because a firm may legitimately disagree -- some
-- send file notes on letterhead, some put their letterhead on court
-- correspondence -- and that choice should be editable.
alter table precedents
  add column if not exists uses_letterhead boolean not null default true;

comment on column precedents.uses_letterhead is
  'Whether the issued document is composed into the company letterhead. False for court documents, deeds and prescribed forms, which carry their own headings.';

-- Court documents, deeds and prescribed forms are never letterhead
-- documents. File notes are internal records rather than correspondence, so
-- they do not need one either.
update precedents
   set uses_letterhead = false
 where document_type in ('court_document', 'deed', 'form', 'file_note')
   and uses_letterhead is true;
