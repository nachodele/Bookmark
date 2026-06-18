-- Public bucket for board cover images uploaded by users

insert into storage.buckets (id, name, public)
values ('board-covers', 'board-covers', true)
on conflict (id) do nothing;

create policy "Users can upload own board covers"
  on storage.objects for insert
  with check (
    bucket_id = 'board-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update own board covers"
  on storage.objects for update
  using (
    bucket_id = 'board-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own board covers"
  on storage.objects for delete
  using (
    bucket_id = 'board-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Board covers are publicly readable"
  on storage.objects for select
  using (bucket_id = 'board-covers');
