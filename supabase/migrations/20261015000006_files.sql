-- Case files are stored in PostgreSQL (bytea, max 10 MB each) so they are covered by the same
-- Row Level Security as every other case record and need no separate storage bucket policy.
alter table public.case_attachments add column content bytea;
alter table public.case_attachments add constraint case_attachments_size check (size_bytes <= 10 * 1024 * 1024);
alter table public.case_attachments alter column storage_path drop not null;

create or replace function public.add_case_attachment(p_case uuid, p_name text, p_mime text, p_content bytea) returns uuid
language plpgsql security definer set search_path = public as $$
declare c cases; v uuid;
begin
  select * into c from cases where id = p_case;
  if not found then raise exception 'Case not found' using errcode = 'P0002'; end if;
  perform assert_member(c.laboratory_id);
  if length(p_content) > 10 * 1024 * 1024 then raise exception 'Files must be 10 MB or smaller'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'File name is required'; end if;
  insert into case_attachments (laboratory_id, case_id, file_name, size_bytes, mime_type, content, uploaded_by)
  values (c.laboratory_id, p_case, left(trim(p_name), 200), length(p_content), p_mime, p_content, auth.uid())
  returning id into v;
  perform _log(c.laboratory_id, 'case.file', format('File "%s" added to %s', left(trim(p_name), 200), c.reference), p_case);
  return v;
end $$;
