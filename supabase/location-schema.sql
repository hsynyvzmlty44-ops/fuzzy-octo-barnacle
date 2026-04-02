-- ============================================================
-- bakalım — Konum & Giriş Takip Tabloları
-- Supabase SQL Editor'de çalıştır.
-- ============================================================

-- ── login_logs ────────────────────────────────────────────────────────────
-- Her başarılı giriş olayını kaydeder.

create table if not exists public.login_logs (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  logged_in_at timestamptz not null default now(),
  ip_address   text,
  user_agent   text
);

alter table public.login_logs enable row level security;

-- Kullanıcı yalnızca kendi giriş kayıtlarını görebilir/yazabilir
create policy "login_logs_own_read"
  on public.login_logs for select
  to authenticated
  using (auth.uid() = user_id);

create policy "login_logs_own_insert"
  on public.login_logs for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ── location_logs ─────────────────────────────────────────────────────────
-- Her konum ölçümünü kaydeder. Hem aktif takip hem SW periyodik senkronizasyonu
-- bu tabloya yazar.

create table if not exists public.location_logs (
  id          uuid         primary key default gen_random_uuid(),
  user_id     uuid         not null references auth.users (id) on delete cascade,
  latitude    double precision not null,
  longitude   double precision not null,
  accuracy    double precision,             -- metre cinsinden doğruluk (varsa)
  recorded_at timestamptz  not null default now()
);

-- Büyük boyutlarda hızlı sorgular için indeks
create index if not exists location_logs_user_recorded
  on public.location_logs (user_id, recorded_at desc);

alter table public.location_logs enable row level security;

-- Kullanıcı yalnızca kendi konum kayıtlarını görebilir/yazabilir
create policy "location_logs_own_read"
  on public.location_logs for select
  to authenticated
  using (auth.uid() = user_id);

create policy "location_logs_own_insert"
  on public.location_logs for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ── location_permissions ──────────────────────────────────────────────────
-- Kullanıcı başına tek kayıt; hangi izinlerin verildiğini saklar.

create table if not exists public.location_permissions (
  user_id                uuid        primary key references auth.users (id) on delete cascade,
  geolocation_granted    boolean     not null default false,
  periodic_sync_supported boolean    not null default false,
  updated_at             timestamptz not null default now()
);

alter table public.location_permissions enable row level security;

-- Kullanıcı yalnızca kendi izin kaydını görebilir/yazabilir
create policy "location_permissions_own_read"
  on public.location_permissions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "location_permissions_own_upsert"
  on public.location_permissions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "location_permissions_own_update"
  on public.location_permissions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Yararlı görünüm: son konum ────────────────────────────────────────────
-- Her kullanıcının en son konumunu hızlıca almak için.

create or replace view public.latest_locations as
  select distinct on (user_id)
    user_id,
    latitude,
    longitude,
    accuracy,
    recorded_at
  from public.location_logs
  order by user_id, recorded_at desc;
