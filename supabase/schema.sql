
begin;
create schema if not exists campus_private;
revoke all on schema campus_private from public,anon;
grant usage on schema campus_private to authenticated;
create table public.campus_workspaces (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120),
 owner_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.campus_members (
 workspace_id uuid not null references public.campus_workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'viewer' check(role in ('owner','editor','viewer')),
 email text not null, joined_at timestamptz not null default now(), primary key(workspace_id,user_id)
);
create index campus_members_user_idx on public.campus_members(user_id);
create index campus_workspaces_owner_idx on public.campus_workspaces(owner_id);
create table public.campus_documents (
 workspace_id uuid primary key references public.campus_workspaces(id) on delete cascade,
 payload jsonb not null default '{"format":1,"items":{},"files":[]}'::jsonb,
 revision bigint not null default 0, updated_at timestamptz not null default now(), updated_by uuid references auth.users(id)
);
create table public.campus_links (
 token uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.campus_workspaces(id) on delete cascade,
 kind text not null check(kind in ('invite','guest')), expires_at timestamptz not null,
 revoked boolean not null default false, created_at timestamptz not null default now(), created_by uuid not null references auth.users(id)
);
create index campus_links_workspace_idx on public.campus_links(workspace_id);
alter table public.campus_workspaces enable row level security;
alter table public.campus_members enable row level security;
alter table public.campus_documents enable row level security;
alter table public.campus_links enable row level security;
revoke all on public.campus_workspaces,public.campus_members,public.campus_documents,public.campus_links from anon,authenticated;
grant select on public.campus_workspaces,public.campus_members,public.campus_documents,public.campus_links to authenticated;
create function campus_private.role_in(p_workspace uuid) returns text language sql stable security definer set search_path='' as $$
 select m.role from public.campus_members m where m.workspace_id=p_workspace and m.user_id=(select auth.uid())
$$;
revoke all on function campus_private.role_in(uuid) from public,anon;
grant execute on function campus_private.role_in(uuid) to authenticated;
create policy campus_workspace_read on public.campus_workspaces for select to authenticated using(campus_private.role_in(id) is not null);
create policy campus_members_read on public.campus_members for select to authenticated using(user_id=(select auth.uid()) or campus_private.role_in(workspace_id)='owner');
create policy campus_document_read on public.campus_documents for select to authenticated using(campus_private.role_in(workspace_id) is not null);
create policy campus_links_owner_read on public.campus_links for select to authenticated using(campus_private.role_in(workspace_id)='owner');
create function campus_private.verified_user() returns uuid language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=(select auth.uid());begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null and coalesce(is_anonymous,false)=false) then raise exception 'Sign in with a verified email first.' using errcode='42501';end if;return uid;
end $$;
revoke all on function campus_private.verified_user() from public,anon;
grant execute on function campus_private.verified_user() to authenticated;
create function public.campus_create_workspace(p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=campus_private.verified_user();wid uuid;mail text;begin
 if (select count(*) from public.campus_workspaces where owner_id=uid)>=5 then raise exception 'Workspace limit reached.';end if;
 select email into mail from auth.users where id=uid;
 insert into public.campus_workspaces(name,owner_id) values(trim(p_name),uid) returning id into wid;
 insert into public.campus_members(workspace_id,user_id,role,email) values(wid,uid,'owner',mail);
 insert into public.campus_documents(workspace_id,updated_by) values(wid,uid);
 return wid;
end $$;
create function public.campus_save_document(p_workspace uuid,p_expected_revision bigint,p_payload jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare uid uuid:=campus_private.verified_user();rev bigint;begin
 if coalesce(campus_private.role_in(p_workspace),'') not in ('owner','editor') then raise exception 'Editor access required.' using errcode='42501';end if;
 if jsonb_typeof(p_payload)<>'object' or p_payload->>'format' is distinct from '1' or jsonb_typeof(p_payload->'items') is distinct from 'object' or jsonb_typeof(p_payload->'files') is distinct from 'array' then raise exception 'Invalid Campus document.' using errcode='22023';end if;
 if octet_length(p_payload::text)>16777216 then raise exception 'Notes exceed the 16 MB workspace document limit; attachments belong in file storage.' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(p_payload->'items') item where item.key !~ '^campus2-(tree$|page-|strokes-|flashcards-|meta-|comments?-|published-|versions-|block-templates$)' or jsonb_typeof(item.value)<>'string') then raise exception 'Invalid document key.' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'files') f where jsonb_typeof(f)<>'object' or coalesce(f->>'path','') not like p_workspace::text||'/%' or coalesce(f->>'id','')='') then raise exception 'Invalid attachment manifest.' using errcode='22023';end if;
 update public.campus_documents set payload=p_payload,revision=revision+1,updated_at=now(),updated_by=uid where workspace_id=p_workspace and revision=p_expected_revision returning revision into rev;
 if rev is null then raise exception 'Another device has saved a newer version.' using errcode='40001';end if;return rev;
end $$;
create function public.campus_create_link(p_workspace uuid,p_kind text,p_days integer default 7) returns jsonb language plpgsql security definer set search_path='' as $$
declare link public.campus_links;begin
 perform campus_private.verified_user();if campus_private.role_in(p_workspace) is distinct from 'owner' then raise exception 'Owner access required.' using errcode='42501';end if;
 if p_kind not in ('invite','guest') or p_days not between 1 and 30 then raise exception 'Choose an invite or guest link lasting 1 to 30 days.' using errcode='22023';end if;
 insert into public.campus_links(workspace_id,kind,expires_at,created_by) values(p_workspace,p_kind,now()+make_interval(days=>p_days),(select auth.uid())) returning * into link;
 return jsonb_build_object('token',link.token,'kind',link.kind,'expires_at',link.expires_at);
end $$;
create function public.campus_revoke_link(p_token uuid) returns void language plpgsql security definer set search_path='' as $$
declare wid uuid;begin
 select workspace_id into wid from public.campus_links where token=p_token;
 if wid is null or campus_private.role_in(wid) is distinct from 'owner' then raise exception 'Owner access required.' using errcode='42501';end if;
 update public.campus_links set revoked=true where token=p_token;
end $$;
create function public.campus_join_workspace(p_token uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=campus_private.verified_user();wid uuid;mail text;begin
 select workspace_id into wid from public.campus_links where token=p_token and kind='invite' and not revoked and expires_at>now();
 if wid is null then raise exception 'Invitation is expired or revoked.' using errcode='42501';end if;
 select email into mail from auth.users where id=uid;
 insert into public.campus_members(workspace_id,user_id,role,email) values(wid,uid,'viewer',mail) on conflict(workspace_id,user_id) do nothing;
 return wid;
end $$;
create function public.campus_set_member_role(p_workspace uuid,p_user uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform campus_private.verified_user();if campus_private.role_in(p_workspace) is distinct from 'owner' then raise exception 'Owner access required.' using errcode='42501';end if;
 if p_role not in ('viewer','editor','remove') then raise exception 'Invalid role.' using errcode='22023';end if;
 if exists(select 1 from public.campus_workspaces where id=p_workspace and owner_id=p_user) then raise exception 'The owner cannot be removed or demoted.' using errcode='42501';end if;
 if p_role='remove' then delete from public.campus_members where workspace_id=p_workspace and user_id=p_user;else update public.campus_members set role=p_role where workspace_id=p_workspace and user_id=p_user;end if;
end $$;
-- Only the server-side guest endpoint can exchange a guest token for a document.
create function public.campus_guest_read(p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare link public.campus_links;doc public.campus_documents;workspace_name text;begin
 select * into link from public.campus_links where token=p_token and kind='guest' and not revoked and expires_at>now();if not found then raise exception 'Share link is expired or revoked.' using errcode='42501';end if;
 select * into doc from public.campus_documents where workspace_id=link.workspace_id;select name into workspace_name from public.campus_workspaces where id=link.workspace_id;
 return jsonb_build_object('workspace_id',link.workspace_id,'name',workspace_name,'expires_at',link.expires_at,'revision',doc.revision,'payload',doc.payload);
end $$;
revoke all on function public.campus_create_workspace(text),public.campus_save_document(uuid,bigint,jsonb),public.campus_create_link(uuid,text,integer),public.campus_revoke_link(uuid),public.campus_join_workspace(uuid),public.campus_set_member_role(uuid,uuid,text),public.campus_guest_read(uuid) from public,anon,authenticated;
grant execute on function public.campus_create_workspace(text),public.campus_save_document(uuid,bigint,jsonb),public.campus_create_link(uuid,text,integer),public.campus_revoke_link(uuid),public.campus_join_workspace(uuid),public.campus_set_member_role(uuid,uuid,text) to authenticated;
grant execute on function public.campus_guest_read(uuid) to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('campus-files','campus-files',false,26214400) on conflict(id) do nothing;
create policy campus_file_read on storage.objects for select to authenticated using(bucket_id='campus-files' and exists(select 1 from public.campus_members m where m.user_id=(select auth.uid()) and m.workspace_id::text=(storage.foldername(name))[1]));
create policy campus_file_insert on storage.objects for insert to authenticated with check(bucket_id='campus-files' and exists(select 1 from public.campus_members m where m.user_id=(select auth.uid()) and m.role in ('owner','editor') and m.workspace_id::text=(storage.foldername(name))[1]));
create policy campus_file_owner_delete on storage.objects for delete to authenticated using(bucket_id='campus-files' and exists(select 1 from public.campus_members m where m.user_id=(select auth.uid()) and m.role='owner' and m.workspace_id::text=(storage.foldername(name))[1]));
alter publication supabase_realtime add table public.campus_documents;
commit;
