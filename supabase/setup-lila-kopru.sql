-- =============================================================================
-- lila-kopru — Supabase SQL Editor'de TEK SEFERDE çalıştır (idempotent)
-- Mevcut projende başka tablolar varsa bu dosya sadece couple_moods ekler.
-- =============================================================================

create table if not exists public.couple_moods (
  slot text primary key check (slot in ('a', 'b')),
  mood_slug text not null default 'mutlu',
  updated_at timestamptz not null default now()
);

insert into public.couple_moods (slot, mood_slug)
values ('a', 'mutlu'), ('b', 'mutlu')
on conflict (slot) do nothing;

alter table public.couple_moods replica identity full;

alter table public.couple_moods enable row level security;

drop policy if exists "couple_moods_select" on public.couple_moods;
drop policy if exists "couple_moods_insert" on public.couple_moods;
drop policy if exists "couple_moods_update" on public.couple_moods;

create policy "couple_moods_select" on public.couple_moods for select to authenticated using (true);
create policy "couple_moods_insert" on public.couple_moods for insert to authenticated with check (true);
create policy "couple_moods_update" on public.couple_moods for update to authenticated using (true) with check (true);

-- Realtime: tablo yayına ekli değilse ekle
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'couple_moods'
  ) then
    alter publication supabase_realtime add table public.couple_moods;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Dijital post-it notları
-- ---------------------------------------------------------------------------
create table if not exists public.couple_postits (
  id uuid primary key default gen_random_uuid(),
  content text not null default '',
  pos_x_pct real not null default 20,
  pos_y_pct real not null default 20,
  z_index int not null default 1,
  color text not null default 'purple',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.couple_postits add column if not exists color text not null default 'purple';

alter table public.couple_postits replica identity full;

alter table public.couple_postits enable row level security;

drop policy if exists "couple_postits_select" on public.couple_postits;
drop policy if exists "couple_postits_insert" on public.couple_postits;
drop policy if exists "couple_postits_update" on public.couple_postits;
drop policy if exists "couple_postits_delete" on public.couple_postits;

create policy "couple_postits_select" on public.couple_postits for select to authenticated using (true);
create policy "couple_postits_insert" on public.couple_postits for insert to authenticated with check (true);
create policy "couple_postits_update" on public.couple_postits for update to authenticated using (true) with check (true);
create policy "couple_postits_delete" on public.couple_postits for delete to authenticated using (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'couple_postits'
  ) then
    alter publication supabase_realtime add table public.couple_postits;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Albüm sayfaları (çift paylaşımı — tüm cihazlarda aynı)
-- image_data: sıkıştırılmış base64 data URL (Storage yerine tek tablo)
-- ---------------------------------------------------------------------------
create table if not exists public.couple_album_pages (
  page_index smallint primary key check (page_index >= 0 and page_index < 100),
  quote text not null default '',
  date text not null default '',
  image_data text,
  image_rotation double precision,
  image_scale double precision,
  image_pan_x double precision,
  image_pan_y double precision,
  updated_at timestamptz not null default now()
);

alter table public.couple_album_pages enable row level security;

drop policy if exists "couple_album_pages_select" on public.couple_album_pages;
drop policy if exists "couple_album_pages_insert" on public.couple_album_pages;
drop policy if exists "couple_album_pages_update" on public.couple_album_pages;
drop policy if exists "couple_album_pages_delete" on public.couple_album_pages;

create policy "couple_album_pages_select" on public.couple_album_pages for select to authenticated using (true);
create policy "couple_album_pages_insert" on public.couple_album_pages for insert to authenticated with check (true);
create policy "couple_album_pages_update" on public.couple_album_pages for update to authenticated using (true) with check (true);
create policy "couple_album_pages_delete" on public.couple_album_pages for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Yapılacaklar listesi (çift paylaşımı)
-- ---------------------------------------------------------------------------
create table if not exists public.couple_todos (
  id uuid primary key,
  text text not null,
  done boolean not null default false,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.couple_todos enable row level security;

drop policy if exists "couple_todos_select" on public.couple_todos;
drop policy if exists "couple_todos_insert" on public.couple_todos;
drop policy if exists "couple_todos_update" on public.couple_todos;
drop policy if exists "couple_todos_delete" on public.couple_todos;

create policy "couple_todos_select" on public.couple_todos for select to authenticated using (true);
create policy "couple_todos_insert" on public.couple_todos for insert to authenticated with check (true);
create policy "couple_todos_update" on public.couple_todos for update to authenticated using (true) with check (true);
create policy "couple_todos_delete" on public.couple_todos for delete to authenticated using (true);
