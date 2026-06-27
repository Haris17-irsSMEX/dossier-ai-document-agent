begin;

alter type public.verification_request_status add value if not exists 'not_required';
alter type public.verification_request_status add value if not exists 'required';
alter type public.verification_request_status add value if not exists 'pending';
alter type public.verification_request_status add value if not exists 'suspicious';
alter type public.verification_request_status add value if not exists 'manual_review';
alter type public.verification_request_status add value if not exists 'api_not_connected';

commit;
