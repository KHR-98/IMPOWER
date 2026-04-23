-- Add kakao_id column and make password_hash nullable for Kakao social login users
alter table users add column if not exists kakao_id text unique;
alter table users alter column password_hash drop not null;
