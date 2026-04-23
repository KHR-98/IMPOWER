-- Add afternoon TBM and checkout TBM time window columns to app_settings
alter table app_settings add column if not exists tbm_afternoon_start text not null default '13:35';
alter table app_settings add column if not exists tbm_afternoon_end   text not null default '13:45';
alter table app_settings add column if not exists tbm_checkout_start  text not null default '16:30';
alter table app_settings add column if not exists tbm_checkout_end    text not null default '16:45';
