-- Supabase SQL Editor'de çalıştır. Kolon adları src/lib/data.ts ile uyumlu.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  isim text,
  boy numeric,
  sehir text,
  updated_at timestamptz default now()
);

create table if not exists public.moods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  durum text,
  tarih timestamptz default now()
);

create table if not exists public.counters (
  id smallint primary key default 1 check (id = 1),
  tanisma_tarihi timestamptz
);

alter table public.profiles enable row level security;
alter table public.moods enable row level security;
alter table public.counters enable row level security;

-- Örnek politikalar (ihtiyaca göre sıkılaştır)
create policy "profiles_own" on public.profiles for all to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "moods_own" on public.moods for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "counters_read" on public.counters for select to authenticated using (true);
create policy "counters_write" on public.counters for all to authenticated using (true) with check (true);

-- İki kişilik mood (Realtime ile senkron)
-- Supabase Dashboard → Database → Replication: `couple_moods` için Realtime açık olmalı
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

create policy "couple_moods_select" on public.couple_moods for select to authenticated using (true);
create policy "couple_moods_insert" on public.couple_moods for insert to authenticated with check (true);
create policy "couple_moods_update" on public.couple_moods for update to authenticated using (true) with check (true);

-- Aşağı satır zaten ekliyse hata verebilir; o zaman Dashboard → Realtime’de tabloyu elle aç.
alter publication supabase_realtime add table public.couple_moods;

-- Dijital post-it notları (sürükle-bırak, iki kişi senkron)
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
