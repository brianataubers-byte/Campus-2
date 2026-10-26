begin;
select set_config('campus_test.owner',gen_random_uuid()::text,true),set_config('campus_test.viewer',gen_random_uuid()::text,true),set_config('campus_test.outsider',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
(current_setting('campus_test.owner')::uuid,'campus-owner-test@example.invalid',now(),'{}'),
(current_setting('campus_test.viewer')::uuid,'campus-viewer-test@example.invalid',now(),'{"role":"owner"}'),
(current_setting('campus_test.outsider')::uuid,'campus-outsider-test@example.invalid',now(),'{}');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('campus_test.owner'),true);
select set_config('campus_test.workspace',public.campus_create_workspace('Authorization checks')::text,true);
select public.campus_save_document(current_setting('campus_test.workspace')::uuid,0,'{"format":1,"items":{"campus2-tree":"[]"},"files":[]}');
select set_config('campus_test.invite',(public.campus_create_link(current_setting('campus_test.workspace')::uuid,'invite',1)->>'token'),true);
select set_config('campus_test.guest',(public.campus_create_link(current_setting('campus_test.workspace')::uuid,'guest',1)->>'token'),true);
do $$begin
 begin perform public.campus_save_document(current_setting('campus_test.workspace')::uuid,1,'{"items":{},"files":[]}');raise exception 'Missing format accepted';exception when invalid_parameter_value then null;end;
 begin perform public.campus_set_member_role(current_setting('campus_test.workspace')::uuid,current_setting('campus_test.owner')::uuid,'remove');raise exception 'Owner removed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('campus_test.viewer'),true);
select public.campus_join_workspace(current_setting('campus_test.invite')::uuid);
do $$begin
 if (select role from public.campus_members where workspace_id=current_setting('campus_test.workspace')::uuid and user_id=auth.uid()) is distinct from 'viewer' then raise exception 'New member is not Viewer';end if;
 if (select count(*) from public.campus_documents where workspace_id=current_setting('campus_test.workspace')::uuid)<>1 then raise exception 'Viewer cannot read';end if;
 if (select count(*) from public.campus_links where workspace_id=current_setting('campus_test.workspace')::uuid)<>0 then raise exception 'Viewer can list secret links';end if;
 begin perform public.campus_save_document(current_setting('campus_test.workspace')::uuid,1,'{"format":1,"items":{},"files":[]}');raise exception 'Viewer wrote document';exception when insufficient_privilege then null;end;
 begin update public.campus_documents set revision=100;raise exception 'Direct Viewer write accepted';exception when insufficient_privilege then null;end;
 begin perform public.campus_set_member_role(current_setting('campus_test.workspace')::uuid,auth.uid(),'editor');raise exception 'Viewer elevated own role';exception when insufficient_privilege then null;end;
 begin perform public.campus_create_link(current_setting('campus_test.workspace')::uuid,'guest',1);raise exception 'Viewer created public share';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('campus_test.outsider'),true);
do $$begin
 if (select count(*) from public.campus_documents where workspace_id=current_setting('campus_test.workspace')::uuid)<>0 then raise exception 'Outsider sees document';end if;
 begin perform public.campus_save_document(current_setting('campus_test.workspace')::uuid,1,'{"format":1,"items":{},"files":[]}');raise exception 'Outsider wrote';exception when insufficient_privilege then null;end;
 begin perform public.campus_join_workspace(current_setting('campus_test.guest')::uuid);raise exception 'Guest token granted membership';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('campus_test.owner'),true);
select public.campus_set_member_role(current_setting('campus_test.workspace')::uuid,current_setting('campus_test.viewer')::uuid,'editor');
select set_config('request.jwt.claim.sub',current_setting('campus_test.viewer'),true);
select public.campus_save_document(current_setting('campus_test.workspace')::uuid,1,'{"format":1,"items":{"campus2-tree":"[]","campus2-page-test":"<p>Editor saved</p>"},"files":[]}');
do $$begin
 begin perform public.campus_save_document(current_setting('campus_test.workspace')::uuid,1,'{"format":1,"items":{},"files":[]}');raise exception 'Stale revision overwrote new content';exception when serialization_failure then null;end;
 if (select revision from public.campus_documents where workspace_id=current_setting('campus_test.workspace')::uuid)<>2 then raise exception 'Revision check failed';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('campus_test.owner'),true);
select public.campus_revoke_link(current_setting('campus_test.invite')::uuid);
select public.campus_set_member_role(current_setting('campus_test.workspace')::uuid,current_setting('campus_test.viewer')::uuid,'remove');
select set_config('request.jwt.claim.sub',current_setting('campus_test.viewer'),true);
do $$begin
 if (select count(*) from public.campus_documents where workspace_id=current_setting('campus_test.workspace')::uuid)<>0 then raise exception 'Revoked member can read';end if;
 begin perform public.campus_join_workspace(current_setting('campus_test.invite')::uuid);raise exception 'Revoked invite accepted';exception when insufficient_privilege then null;end;
 begin perform public.campus_save_document(current_setting('campus_test.workspace')::uuid,2,'{"format":1,"items":{},"files":[]}');raise exception 'Revoked Editor can write';exception when insufficient_privilege then null;end;
end $$;
reset role;set local role anon;
do $$begin
 begin perform public.campus_guest_read(current_setting('campus_test.guest')::uuid);raise exception 'Guest RPC exposed directly';exception when insufficient_privilege then null;end;
 begin perform public.campus_create_workspace('Anonymous');raise exception 'Anonymous created a space';exception when insufficient_privilege then null;end;
end $$;
reset role;set local role service_role;
do $$begin
 if (public.campus_guest_read(current_setting('campus_test.guest')::uuid)->>'revision')<>'2' then raise exception 'Guest version wrong';end if;
end $$;
reset role;
update public.campus_links set expires_at=now()-interval '1 second' where token=current_setting('campus_test.guest')::uuid;
set local role service_role;
do $$begin
 begin perform public.campus_guest_read(current_setting('campus_test.guest')::uuid);raise exception 'Expired guest token accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: Viewer default; private reads; denied direct writes and role elevation; Editor writes; revision conflicts; revocation; guest separation and expiry; owner protection; invalid payload rejection' as result;
rollback;