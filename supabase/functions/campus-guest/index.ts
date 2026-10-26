import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
const origin='https://brianataubers-byte.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'content-type, apikey, authorization','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers});
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return new Response(JSON.stringify({error:'Origin not allowed'}),{status:403,headers});
 try{const body=await req.json();if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.token||''))throw Error('Invalid share link');
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await admin.rpc('campus_guest_read',{p_token:body.token});if(error||!data)throw Error('Share link is expired or revoked');
 const ttl=Math.max(1,Math.min(300,Math.floor((Date.parse(data.expires_at)-Date.now())/1000)));
 const files=data.payload.files||[];for(const file of files){if(typeof file.path!=='string'||!new RegExp('^'+data.workspace_id+'/[A-Za-z0-9_-]+$').test(file.path))throw Error('Invalid attachment');const signed=await admin.storage.from('campus-files').createSignedUrl(file.path,ttl);if(signed.error)throw Error('Attachment not available');file.signedUrl=signed.data.signedUrl}
 return new Response(JSON.stringify(data),{headers});
 }catch{return new Response(JSON.stringify({error:'Linkul nu este valid, a expirat sau a fost revocat.'}),{status:403,headers})}
});
