-- ============================================================================
-- Kulüp altyapısı — veritabanı kurulumu (tek dosya)
--
-- BOŞ bir Postgres veritabanına BİR KEZ uygulanır (ör. yeni Supabase projesinin SQL Editor'ü ya da
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f cms/sql/000_kurulum.sql
-- ). Payload CMS'in tüm tabloları (public şeması), çerezsiz analitik tablosu (public.analytics_events) ve
-- gözlem tabloları (obs şeması) kurulur. Veri eklenmez; ilk yönetici hesabı CMS paneli açılınca oluşturulur.
--
-- Bu dosya koddan üretildi (Payload 3.90 şema push'u + elle yönetilen ek tablolar). Kodda koleksiyon/alan
-- değiştirirsen canlı veritabanına push YAPMA; değişikliği yeni bir SQL dosyasıyla (001_..., 002_...) ekle.
-- Ayrıntı: README → "Veritabanı şeması".
-- ============================================================================

BEGIN;

--
-- PostgreSQL database dump
--

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', true);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: obs; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS obs;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';

--
-- Name: enum_achievements_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_achievements_category AS ENUM (
    'competition',
    'event',
    'project',
    'other'
);

--
-- Name: enum_blog_posts_locale; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_blog_posts_locale AS ENUM (
    'tr',
    'en'
);

--
-- Name: enum_blog_posts_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_blog_posts_status AS ENUM (
    'draft',
    'published'
);

--
-- Name: enum_certificates_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_certificates_type AS ENUM (
    'participation',
    'achievement',
    'appreciation'
);

--
-- Name: enum_contact_messages_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_contact_messages_status AS ENUM (
    'unread',
    'read',
    'replied'
);

--
-- Name: enum_core_team_applications_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_core_team_applications_status AS ENUM (
    'new',
    'reviewing',
    'interview',
    'accepted',
    'rejected'
);

--
-- Name: enum_email_templates_purpose; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_email_templates_purpose AS ENUM (
    'event-accepted',
    'event-rejected',
    'event-waitlist',
    'gate-welcome',
    'general',
    'member-application-received',
    'event-registration-received',
    'coreteam-application-received'
);

--
-- Name: enum_event_registrations_application_stage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_event_registrations_application_stage AS ENUM (
    'normal',
    'late'
);

--
-- Name: enum_event_registrations_certificate_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_event_registrations_certificate_type AS ENUM (
    'participation',
    'achievement',
    'appreciation'
);

--
-- Name: enum_event_registrations_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_event_registrations_status AS ENUM (
    'pending',
    'accepted',
    'rejected',
    'waitlist'
);

--
-- Name: enum_events_external_links_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_events_external_links_type AS ENUM (
    'youtube',
    'instagram',
    'drive',
    'other'
);

--
-- Name: enum_events_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_events_mode AS ENUM (
    'test',
    'live'
);

--
-- Name: enum_events_registration_fields_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_events_registration_fields_type AS ENUM (
    'text',
    'textarea',
    'number',
    'email',
    'checkbox',
    'rating',
    'select',
    'quiz'
);

--
-- Name: enum_events_registration_stage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_events_registration_stage AS ENUM (
    'open',
    'waitlist',
    'closed'
);

--
-- Name: enum_events_results_display; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_events_results_display AS ENUM (
    'top3',
    'first',
    'full'
);

--
-- Name: enum_events_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_events_status AS ENUM (
    'active',
    'completed'
);

--
-- Name: enum_jury_sessions_reveal_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_jury_sessions_reveal_mode AS ENUM (
    'stepwise',
    'top3',
    'first',
    'full'
);

--
-- Name: enum_jury_sessions_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_jury_sessions_status AS ENUM (
    'idle',
    'voting',
    'finished',
    'revealing',
    'done'
);

--
-- Name: enum_member_applications_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_member_applications_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);

--
-- Name: enum_members_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_members_status AS ENUM (
    'active',
    'inactive',
    'deletion_requested'
);

--
-- Name: enum_team_media_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_team_media_kind AS ENUM (
    'logo',
    'cover',
    'gif'
);

--
-- Name: enum_team_memberships_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_team_memberships_role AS ENUM (
    'captain',
    'member'
);

--
-- Name: enum_team_memberships_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_team_memberships_status AS ENUM (
    'pending',
    'accepted',
    'rejected',
    'left',
    'removed'
);

--
-- Name: enum_teams_contact_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_teams_contact_type AS ENUM (
    'telegram',
    'instagram',
    'email',
    'whatsapp'
);

--
-- Name: enum_teams_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_teams_status AS ENUM (
    'draft',
    'pending',
    'approved',
    'accepted',
    'rejected'
);

--
-- Name: enum_university_guide_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_university_guide_category AS ENUM (
    'kampus',
    'konum',
    'ders',
    'yazilim',
    'kulup',
    'kaynak'
);

--
-- Name: enum_users_roles; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_users_roles AS ENUM (
    'admin',
    'gate'
);

--
-- Name: enum_wa_queue_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_wa_queue_source AS ENUM (
    'gate',
    'decision',
    'bulk',
    'system'
);

--
-- Name: enum_wa_queue_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_wa_queue_status AS ENUM (
    'pending',
    'sent',
    'failed',
    'cancelled'
);

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: blocks; Type: TABLE; Schema: obs; Owner: -
--

CREATE TABLE obs.blocks (
    bucket text NOT NULL,
    key_hash text NOT NULL,
    until timestamp with time zone NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: events; Type: TABLE; Schema: obs; Owner: -
--

CREATE TABLE obs.events (
    id bigint NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    level text NOT NULL,
    category text NOT NULL,
    kind text NOT NULL,
    topic text NOT NULL,
    text text,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    notify boolean DEFAULT true NOT NULL,
    notified_at timestamp with time zone,
    attempts smallint DEFAULT 0 NOT NULL
);

--
-- Name: events_id_seq; Type: SEQUENCE; Schema: obs; Owner: -
--

CREATE SEQUENCE obs.events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: events_id_seq; Type: SEQUENCE OWNED BY; Schema: obs; Owner: -
--

ALTER SEQUENCE obs.events_id_seq OWNED BY obs.events.id;

--
-- Name: kv; Type: TABLE; Schema: obs; Owner: -
--

CREATE TABLE obs.kv (
    key text NOT NULL,
    value jsonb NOT NULL,
    expires_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: rate_limits; Type: TABLE; Schema: obs; Owner: -
--

CREATE TABLE obs.rate_limits (
    bucket text NOT NULL,
    key_hash text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL
);

--
-- Name: security_events; Type: TABLE; Schema: obs; Owner: -
--

CREATE TABLE obs.security_events (
    id bigint NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    kind text NOT NULL,
    ip_hash text,
    ip text,
    device text,
    actor text,
    path text,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL
);

--
-- Name: security_events_id_seq; Type: SEQUENCE; Schema: obs; Owner: -
--

CREATE SEQUENCE obs.security_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: security_events_id_seq; Type: SEQUENCE OWNED BY; Schema: obs; Owner: -
--

ALTER SEQUENCE obs.security_events_id_seq OWNED BY obs.security_events.id;

--
-- Name: achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.achievements (
    id integer NOT NULL,
    title character varying NOT NULL,
    slug character varying,
    date timestamp(3) with time zone,
    description jsonb,
    summary character varying,
    image_id integer,
    category public.enum_achievements_category DEFAULT 'competition'::public.enum_achievements_category,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: achievements_gallery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.achievements_gallery (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    image_id integer NOT NULL
);

--
-- Name: achievements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.achievements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: achievements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.achievements_id_seq OWNED BY public.achievements.id;

--
-- Name: analytics_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_events (
    id bigint NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    type text NOT NULL,
    path text NOT NULL,
    entity_type text,
    entity_id integer,
    ref text,
    visitor_hash text NOT NULL,
    session_hash text NOT NULL,
    device text NOT NULL,
    referrer_host text,
    meta jsonb
);

--
-- Name: TABLE analytics_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.analytics_events IS 'Birinci taraf, çerezsiz ziyaretçi olayları. Ham IP/UA yok; hash''ler günlük tuzla.';

--
-- Name: analytics_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.analytics_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: analytics_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.analytics_events_id_seq OWNED BY public.analytics_events.id;

--
-- Name: blog_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_posts (
    id integer NOT NULL,
    title character varying NOT NULL,
    slug character varying,
    content jsonb NOT NULL,
    cover_image_id integer,
    author_profile_picture_id integer,
    author_name character varying,
    author_role character varying,
    locale public.enum_blog_posts_locale DEFAULT 'tr'::public.enum_blog_posts_locale,
    published_at timestamp(3) with time zone,
    status public.enum_blog_posts_status DEFAULT 'draft'::public.enum_blog_posts_status,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: blog_posts_author_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_posts_author_links (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    url character varying,
    label character varying
);

--
-- Name: blog_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blog_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: blog_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blog_posts_id_seq OWNED BY public.blog_posts.id;

--
-- Name: certificates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.certificates (
    id integer NOT NULL,
    code character varying,
    event_id integer NOT NULL,
    registration_id integer,
    full_name character varying NOT NULL,
    type public.enum_certificates_type DEFAULT 'participation'::public.enum_certificates_type NOT NULL,
    issue_date timestamp(3) with time zone NOT NULL,
    image_file_id integer,
    pdf_file_id integer,
    revoked boolean DEFAULT false,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: certificates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.certificates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: certificates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.certificates_id_seq OWNED BY public.certificates.id;

--
-- Name: contact_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_messages (
    id integer NOT NULL,
    full_name character varying NOT NULL,
    email character varying NOT NULL,
    subject character varying NOT NULL,
    message character varying NOT NULL,
    status public.enum_contact_messages_status DEFAULT 'unread'::public.enum_contact_messages_status,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: contact_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contact_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: contact_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contact_messages_id_seq OWNED BY public.contact_messages.id;

--
-- Name: core_team_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.core_team_applications (
    id integer NOT NULL,
    full_name character varying NOT NULL,
    email character varying NOT NULL,
    phone character varying,
    department character varying,
    grade character varying,
    hometown character varying,
    area character varying,
    portfolio_url character varying,
    github_url character varying,
    motivation_letter character varying,
    kvkk_approved boolean DEFAULT false,
    privacy_policy_approved boolean DEFAULT false,
    status public.enum_core_team_applications_status DEFAULT 'new'::public.enum_core_team_applications_status,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: core_team_applications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.core_team_applications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: core_team_applications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.core_team_applications_id_seq OWNED BY public.core_team_applications.id;

--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id integer NOT NULL,
    name character varying NOT NULL,
    purpose public.enum_email_templates_purpose NOT NULL,
    subject character varying NOT NULL,
    html character varying NOT NULL,
    whatsapp_text character varying,
    is_active boolean DEFAULT true,
    related_event_id integer,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: email_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: email_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_templates_id_seq OWNED BY public.email_templates.id;

--
-- Name: event_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_registrations (
    id integer NOT NULL,
    event_id integer NOT NULL,
    status public.enum_event_registrations_status DEFAULT 'pending'::public.enum_event_registrations_status,
    attended boolean DEFAULT false,
    checked_in_at timestamp(3) with time zone,
    gate_fields jsonb,
    certificate_type public.enum_event_registrations_certificate_type DEFAULT 'participation'::public.enum_event_registrations_certificate_type NOT NULL,
    is_test boolean DEFAULT false,
    application_stage public.enum_event_registrations_application_stage DEFAULT 'normal'::public.enum_event_registrations_application_stage,
    ticket_token character varying,
    full_name character varying NOT NULL,
    email character varying NOT NULL,
    phone character varying,
    department character varying,
    kvkk_approved boolean DEFAULT false,
    privacy_policy_approved boolean DEFAULT false,
    notes character varying,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: event_registrations_dynamic_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_registrations_dynamic_answers (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    question character varying,
    answer character varying
);

--
-- Name: event_registrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.event_registrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: event_registrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.event_registrations_id_seq OWNED BY public.event_registrations.id;

--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id integer NOT NULL,
    title character varying NOT NULL,
    mode public.enum_events_mode DEFAULT 'test'::public.enum_events_mode NOT NULL,
    status public.enum_events_status DEFAULT 'active'::public.enum_events_status NOT NULL,
    registration_stage public.enum_events_registration_stage DEFAULT 'open'::public.enum_events_registration_stage,
    real_slug character varying,
    slug character varying,
    date timestamp(3) with time zone NOT NULL,
    end_date timestamp(3) with time zone,
    location character varying,
    location_link character varying,
    capacity numeric,
    description jsonb,
    image_id integer NOT NULL,
    scanner_active boolean DEFAULT false,
    scanner_pin character varying,
    scanner_url character varying,
    gate_field_definitions jsonb,
    registration_link character varying,
    team_mode boolean DEFAULT false,
    team_settings_min_members numeric DEFAULT 2,
    team_settings_max_members numeric DEFAULT 5,
    team_settings_registration_open boolean DEFAULT true,
    team_settings_registration_deadline timestamp(3) with time zone,
    team_settings_teams_heading character varying DEFAULT 'Başvuran takımlar'::character varying,
    team_settings_teams_notice character varying DEFAULT 'Başvuru aşamasında seçilen takımlar burada yayımlanacaktır.'::character varying,
    team_settings_submission_open boolean DEFAULT false,
    team_settings_submission_deadline timestamp(3) with time zone,
    results_published boolean DEFAULT false,
    results_display public.enum_events_results_display DEFAULT 'top3'::public.enum_events_results_display,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: events_external_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events_external_links (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    type public.enum_events_external_links_type NOT NULL,
    url character varying NOT NULL,
    label character varying
);

--
-- Name: events_gallery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events_gallery (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    media_id integer NOT NULL,
    caption character varying
);

--
-- Name: events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.events_id_seq OWNED BY public.events.id;

--
-- Name: events_judging_criteria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events_judging_criteria (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    name character varying,
    weight numeric DEFAULT 1,
    max numeric DEFAULT 10
);

--
-- Name: events_prizes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events_prizes (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    rank numeric NOT NULL,
    title character varying NOT NULL,
    description character varying,
    image_id integer
);

--
-- Name: events_registration_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events_registration_fields (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    name character varying,
    type public.enum_events_registration_fields_type DEFAULT 'text'::public.enum_events_registration_fields_type,
    options character varying,
    image_id integer,
    required boolean DEFAULT false
);

--
-- Name: events_registration_fields_choices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events_registration_fields_choices (
    _order integer NOT NULL,
    _parent_id character varying NOT NULL,
    id character varying NOT NULL,
    image_id integer,
    label character varying
);

--
-- Name: events_rels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events_rels (
    id integer NOT NULL,
    "order" integer,
    parent_id integer NOT NULL,
    path character varying NOT NULL,
    participants_id integer
);

--
-- Name: events_rels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.events_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: events_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.events_rels_id_seq OWNED BY public.events_rels.id;

--
-- Name: events_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events_results (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    rank numeric NOT NULL,
    team_id integer,
    name character varying,
    score numeric
);

--
-- Name: faq; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faq (
    id integer NOT NULL,
    _order character varying,
    question character varying NOT NULL,
    answer character varying NOT NULL,
    category_id integer NOT NULL,
    show_on_homepage boolean DEFAULT false,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: faq_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faq_categories (
    id integer NOT NULL,
    _order character varying,
    name character varying NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: faq_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.faq_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: faq_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.faq_categories_id_seq OWNED BY public.faq_categories.id;

--
-- Name: faq_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.faq_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: faq_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.faq_id_seq OWNED BY public.faq.id;

--
-- Name: hall_of_fame; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hall_of_fame (
    id integer NOT NULL,
    year numeric DEFAULT 2026 NOT NULL,
    link character varying,
    link2 character varying,
    link3 character varying,
    name character varying NOT NULL,
    title character varying NOT NULL,
    description character varying,
    image_id integer,
    "order" numeric DEFAULT 0,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: hall_of_fame_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hall_of_fame_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: hall_of_fame_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hall_of_fame_id_seq OWNED BY public.hall_of_fame.id;

--
-- Name: jury_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jury_sessions (
    id integer NOT NULL,
    event_id integer NOT NULL,
    host_id integer,
    status public.enum_jury_sessions_status DEFAULT 'idle'::public.enum_jury_sessions_status NOT NULL,
    reveal_mode public.enum_jury_sessions_reveal_mode DEFAULT 'stepwise'::public.enum_jury_sessions_reveal_mode NOT NULL,
    current_index numeric DEFAULT 0,
    reveal_step numeric DEFAULT 0,
    version numeric DEFAULT 0,
    "order" jsonb,
    judge_ids jsonb,
    opened_at jsonb,
    final_ranking jsonb,
    stage_key character varying,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: jury_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.jury_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: jury_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.jury_sessions_id_seq OWNED BY public.jury_sessions.id;

--
-- Name: legal_docs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_docs (
    id integer NOT NULL,
    kvkk jsonb,
    gizlilik jsonb,
    updated_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone
);

--
-- Name: legal_docs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.legal_docs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: legal_docs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.legal_docs_id_seq OWNED BY public.legal_docs.id;

--
-- Name: media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media (
    id integer NOT NULL,
    alt character varying NOT NULL,
    _objectkey character varying,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    url character varying,
    thumbnail_u_r_l character varying,
    filename character varying,
    mime_type character varying,
    filesize numeric,
    width numeric,
    height numeric
);

--
-- Name: media_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.media_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: media_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.media_id_seq OWNED BY public.media.id;

--
-- Name: member_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_applications (
    id integer NOT NULL,
    full_name character varying NOT NULL,
    email character varying NOT NULL,
    phone character varying,
    department character varying,
    year character varying,
    kvkk_approved boolean DEFAULT false NOT NULL,
    privacy_policy_approved boolean DEFAULT false,
    status public.enum_member_applications_status DEFAULT 'pending'::public.enum_member_applications_status,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: member_applications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.member_applications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: member_applications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.member_applications_id_seq OWNED BY public.member_applications.id;

--
-- Name: members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.members (
    id integer NOT NULL,
    full_name character varying NOT NULL,
    email character varying NOT NULL,
    phone character varying,
    department character varying,
    year character varying,
    status public.enum_members_status DEFAULT 'active'::public.enum_members_status,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.members_id_seq OWNED BY public.members.id;

--
-- Name: members_interests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.members_interests (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    interest character varying
);

--
-- Name: participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.participants (
    id integer NOT NULL,
    full_name character varying NOT NULL,
    email_verified boolean DEFAULT false,
    kvkk_approved_at timestamp(3) with time zone,
    verify_code_hash character varying,
    verify_code_expires timestamp(3) with time zone,
    verify_attempts numeric DEFAULT 0,
    reset_code_hash character varying,
    reset_code_expires timestamp(3) with time zone,
    reset_attempts numeric DEFAULT 0,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    email character varying NOT NULL,
    reset_password_token character varying,
    reset_password_expiration timestamp(3) with time zone,
    salt character varying,
    hash character varying,
    reset_password_requested_at timestamp(3) with time zone,
    login_attempts numeric DEFAULT 0,
    lock_until timestamp(3) with time zone
);

--
-- Name: participants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.participants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: participants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.participants_id_seq OWNED BY public.participants.id;

--
-- Name: participants_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.participants_sessions (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    created_at timestamp(3) with time zone,
    expires_at timestamp(3) with time zone NOT NULL
);

--
-- Name: payload_kv; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payload_kv (
    id integer NOT NULL,
    key character varying NOT NULL,
    data jsonb NOT NULL
);

--
-- Name: payload_kv_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payload_kv_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: payload_kv_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payload_kv_id_seq OWNED BY public.payload_kv.id;

--
-- Name: payload_locked_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payload_locked_documents (
    id integer NOT NULL,
    global_slug character varying,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: payload_locked_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payload_locked_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: payload_locked_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payload_locked_documents_id_seq OWNED BY public.payload_locked_documents.id;

--
-- Name: payload_locked_documents_rels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payload_locked_documents_rels (
    id integer NOT NULL,
    "order" integer,
    parent_id integer NOT NULL,
    path character varying NOT NULL,
    users_id integer,
    media_id integer,
    events_id integer,
    event_registrations_id integer,
    wa_queue_id integer,
    certificates_id integer,
    email_templates_id integer,
    whatsapp_templates_id integer,
    members_id integer,
    member_applications_id integer,
    core_team_applications_id integer,
    blog_posts_id integer,
    team_members_id integer,
    faq_categories_id integer,
    faq_id integer,
    contact_messages_id integer,
    achievements_id integer,
    university_guide_id integer,
    hall_of_fame_id integer,
    participants_id integer,
    teams_id integer,
    team_memberships_id integer,
    team_scores_id integer,
    team_media_id integer,
    jury_sessions_id integer
);

--
-- Name: payload_locked_documents_rels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payload_locked_documents_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: payload_locked_documents_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payload_locked_documents_rels_id_seq OWNED BY public.payload_locked_documents_rels.id;

--
-- Name: payload_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payload_migrations (
    id integer NOT NULL,
    name character varying,
    batch numeric,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: payload_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payload_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: payload_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payload_migrations_id_seq OWNED BY public.payload_migrations.id;

--
-- Name: payload_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payload_preferences (
    id integer NOT NULL,
    key character varying,
    value jsonb,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: payload_preferences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payload_preferences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: payload_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payload_preferences_id_seq OWNED BY public.payload_preferences.id;

--
-- Name: payload_preferences_rels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payload_preferences_rels (
    id integer NOT NULL,
    "order" integer,
    parent_id integer NOT NULL,
    path character varying NOT NULL,
    users_id integer,
    participants_id integer
);

--
-- Name: payload_preferences_rels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payload_preferences_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: payload_preferences_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payload_preferences_rels_id_seq OWNED BY public.payload_preferences_rels.id;

--
-- Name: site_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings (
    id integer NOT NULL,
    active_members numeric DEFAULT 92,
    contact_email character varying DEFAULT 'iletisim@kulubum.example.com'::character varying,
    instagram_url character varying DEFAULT ''::character varying,
    whatsapp_url character varying,
    linkedin_url character varying,
    show_linkedin boolean DEFAULT false,
    show_floating_socials boolean DEFAULT true,
    analytics_enabled boolean DEFAULT true,
    marquee_text character varying DEFAULT 'Örnek Üniversitesi Bilişim Kulübü Etkinliklerine Katıl! • Yeni Dönem Kayıtları Başladı! •'::character varying,
    about_us_text character varying DEFAULT 'Örnek Üniversitesi öğrencilerinin kurduğu bir teknoloji topluluğuyuz. Öğrenciler tarafından, öğrenciler için teknoloji topluluğu. Teorik eğitimlerin yanında güncel teknolojileri pratik projelerle deneyimleme fırsatı sunuyor; yazılımdan siber güvenliğe, yapay zekadan oyun geliştirmeye kadar geniş bir alanda birlikte öğreniyor ve üretiyoruz.'::character varying,
    featured_event_id integer,
    core_team_applications_open boolean DEFAULT true,
    updated_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone
);

--
-- Name: site_settings_core_team_areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings_core_team_areas (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    area character varying NOT NULL
);

--
-- Name: site_settings_footer_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings_footer_emails (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    email character varying NOT NULL
);

--
-- Name: site_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.site_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: site_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.site_settings_id_seq OWNED BY public.site_settings.id;

--
-- Name: site_settings_instagram_reels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings_instagram_reels (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    video_id integer NOT NULL
);

--
-- Name: site_settings_landing_gallery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings_landing_gallery (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    media_id integer NOT NULL,
    title character varying
);

--
-- Name: site_settings_link_page_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings_link_page_links (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    label character varying NOT NULL,
    url character varying NOT NULL,
    highlight boolean DEFAULT false,
    active boolean DEFAULT true
);

--
-- Name: team_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_media (
    id integer NOT NULL,
    kind public.enum_team_media_kind NOT NULL,
    team_id integer,
    uploaded_by_id integer,
    prefix character varying DEFAULT 'takim'::character varying,
    _objectkey character varying,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    url character varying,
    thumbnail_u_r_l character varying,
    filename character varying,
    mime_type character varying,
    filesize numeric,
    width numeric,
    height numeric
);

--
-- Name: team_media_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.team_media_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: team_media_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.team_media_id_seq OWNED BY public.team_media.id;

--
-- Name: team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_members (
    id integer NOT NULL,
    name character varying NOT NULL,
    role character varying NOT NULL,
    "order" numeric DEFAULT 99,
    year character varying DEFAULT '2025-2026'::character varying NOT NULL,
    photo_id integer,
    linkedin_url character varying,
    github_url character varying,
    is_active_team boolean DEFAULT false,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: team_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.team_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: team_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.team_members_id_seq OWNED BY public.team_members.id;

--
-- Name: team_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_memberships (
    id integer NOT NULL,
    team_id integer NOT NULL,
    event_id integer NOT NULL,
    participant_id integer NOT NULL,
    role public.enum_team_memberships_role DEFAULT 'member'::public.enum_team_memberships_role NOT NULL,
    status public.enum_team_memberships_status DEFAULT 'pending'::public.enum_team_memberships_status NOT NULL,
    message character varying,
    decided_at timestamp(3) with time zone,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: team_memberships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.team_memberships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: team_memberships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.team_memberships_id_seq OWNED BY public.team_memberships.id;

--
-- Name: team_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_scores (
    id integer NOT NULL,
    event_id integer NOT NULL,
    team_id integer NOT NULL,
    judge_id integer NOT NULL,
    scores jsonb NOT NULL,
    total numeric,
    comment character varying,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: team_scores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.team_scores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: team_scores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.team_scores_id_seq OWNED BY public.team_scores.id;

--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id integer NOT NULL,
    name character varying NOT NULL,
    status public.enum_teams_status DEFAULT 'draft'::public.enum_teams_status NOT NULL,
    admin_note character varying,
    event_id integer NOT NULL,
    captain_id integer NOT NULL,
    slug character varying,
    invite_code character varying,
    approved_at timestamp(3) with time zone,
    edit_count numeric DEFAULT 0,
    rejection_mail_sent_at timestamp(3) with time zone,
    acceptance_mail_sent_at timestamp(3) with time zone,
    logo_id integer,
    cover_id integer,
    manifesto character varying,
    design jsonb,
    contact_type public.enum_teams_contact_type,
    contact_value character varying,
    submission_project_name character varying,
    submission_summary character varying,
    submission_github_url character varying,
    submission_demo_url character varying,
    submission_video_url character varying,
    submission_submitted_at timestamp(3) with time zone,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: teams_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.teams_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: teams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.teams_id_seq OWNED BY public.teams.id;

--
-- Name: university_guide; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.university_guide (
    id integer NOT NULL,
    title character varying NOT NULL,
    slug character varying,
    category public.enum_university_guide_category NOT NULL,
    excerpt character varying,
    location_map_url character varying,
    content jsonb,
    "order" numeric DEFAULT 0,
    active boolean DEFAULT true,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: university_guide_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.university_guide_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: university_guide_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.university_guide_id_seq OWNED BY public.university_guide.id;

--
-- Name: university_guide_rels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.university_guide_rels (
    id integer NOT NULL,
    "order" integer,
    parent_id integer NOT NULL,
    path character varying NOT NULL,
    blog_posts_id integer
);

--
-- Name: university_guide_rels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.university_guide_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: university_guide_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.university_guide_rels_id_seq OWNED BY public.university_guide_rels.id;

--
-- Name: university_guide_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.university_guide_settings (
    id integer NOT NULL,
    welcome_title character varying DEFAULT 'Kampüse Hoş Geldin!'::character varying,
    welcome_message jsonb,
    start_reading_link_id integer,
    updated_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone
);

--
-- Name: university_guide_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.university_guide_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: university_guide_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.university_guide_settings_id_seq OWNED BY public.university_guide_settings.id;

--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    totp_secret character varying,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    email character varying NOT NULL,
    reset_password_token character varying,
    reset_password_expiration timestamp(3) with time zone,
    salt character varying,
    hash character varying,
    reset_password_requested_at timestamp(3) with time zone,
    login_attempts numeric DEFAULT 0,
    lock_until timestamp(3) with time zone
);

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;

--
-- Name: users_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users_roles (
    "order" integer NOT NULL,
    parent_id integer NOT NULL,
    value public.enum_users_roles,
    id integer NOT NULL
);

--
-- Name: users_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: users_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_roles_id_seq OWNED BY public.users_roles.id;

--
-- Name: users_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users_sessions (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id character varying NOT NULL,
    created_at timestamp(3) with time zone,
    expires_at timestamp(3) with time zone NOT NULL
);

--
-- Name: wa_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wa_queue (
    id integer NOT NULL,
    "to" character varying NOT NULL,
    message character varying NOT NULL,
    media_url character varying,
    status public.enum_wa_queue_status DEFAULT 'pending'::public.enum_wa_queue_status NOT NULL,
    source public.enum_wa_queue_source NOT NULL,
    attempts numeric DEFAULT 0 NOT NULL,
    error character varying,
    sent_at timestamp(3) with time zone,
    related_event_id integer,
    related_registration_id integer,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: wa_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wa_queue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: wa_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wa_queue_id_seq OWNED BY public.wa_queue.id;

--
-- Name: whatsapp_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_templates (
    id integer NOT NULL,
    name character varying NOT NULL,
    message character varying NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);

--
-- Name: whatsapp_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.whatsapp_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: whatsapp_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.whatsapp_templates_id_seq OWNED BY public.whatsapp_templates.id;

--
-- Name: events id; Type: DEFAULT; Schema: obs; Owner: -
--

ALTER TABLE ONLY obs.events ALTER COLUMN id SET DEFAULT nextval('obs.events_id_seq'::regclass);

--
-- Name: security_events id; Type: DEFAULT; Schema: obs; Owner: -
--

ALTER TABLE ONLY obs.security_events ALTER COLUMN id SET DEFAULT nextval('obs.security_events_id_seq'::regclass);

--
-- Name: achievements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements ALTER COLUMN id SET DEFAULT nextval('public.achievements_id_seq'::regclass);

--
-- Name: analytics_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_events ALTER COLUMN id SET DEFAULT nextval('public.analytics_events_id_seq'::regclass);

--
-- Name: blog_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts ALTER COLUMN id SET DEFAULT nextval('public.blog_posts_id_seq'::regclass);

--
-- Name: certificates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates ALTER COLUMN id SET DEFAULT nextval('public.certificates_id_seq'::regclass);

--
-- Name: contact_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages ALTER COLUMN id SET DEFAULT nextval('public.contact_messages_id_seq'::regclass);

--
-- Name: core_team_applications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.core_team_applications ALTER COLUMN id SET DEFAULT nextval('public.core_team_applications_id_seq'::regclass);

--
-- Name: email_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates ALTER COLUMN id SET DEFAULT nextval('public.email_templates_id_seq'::regclass);

--
-- Name: event_registrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_registrations ALTER COLUMN id SET DEFAULT nextval('public.event_registrations_id_seq'::regclass);

--
-- Name: events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events ALTER COLUMN id SET DEFAULT nextval('public.events_id_seq'::regclass);

--
-- Name: events_rels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_rels ALTER COLUMN id SET DEFAULT nextval('public.events_rels_id_seq'::regclass);

--
-- Name: faq id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faq ALTER COLUMN id SET DEFAULT nextval('public.faq_id_seq'::regclass);

--
-- Name: faq_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faq_categories ALTER COLUMN id SET DEFAULT nextval('public.faq_categories_id_seq'::regclass);

--
-- Name: hall_of_fame id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hall_of_fame ALTER COLUMN id SET DEFAULT nextval('public.hall_of_fame_id_seq'::regclass);

--
-- Name: jury_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jury_sessions ALTER COLUMN id SET DEFAULT nextval('public.jury_sessions_id_seq'::regclass);

--
-- Name: legal_docs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_docs ALTER COLUMN id SET DEFAULT nextval('public.legal_docs_id_seq'::regclass);

--
-- Name: media id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media ALTER COLUMN id SET DEFAULT nextval('public.media_id_seq'::regclass);

--
-- Name: member_applications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_applications ALTER COLUMN id SET DEFAULT nextval('public.member_applications_id_seq'::regclass);

--
-- Name: members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members ALTER COLUMN id SET DEFAULT nextval('public.members_id_seq'::regclass);

--
-- Name: participants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participants ALTER COLUMN id SET DEFAULT nextval('public.participants_id_seq'::regclass);

--
-- Name: payload_kv id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_kv ALTER COLUMN id SET DEFAULT nextval('public.payload_kv_id_seq'::regclass);

--
-- Name: payload_locked_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents ALTER COLUMN id SET DEFAULT nextval('public.payload_locked_documents_id_seq'::regclass);

--
-- Name: payload_locked_documents_rels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels ALTER COLUMN id SET DEFAULT nextval('public.payload_locked_documents_rels_id_seq'::regclass);

--
-- Name: payload_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_migrations ALTER COLUMN id SET DEFAULT nextval('public.payload_migrations_id_seq'::regclass);

--
-- Name: payload_preferences id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_preferences ALTER COLUMN id SET DEFAULT nextval('public.payload_preferences_id_seq'::regclass);

--
-- Name: payload_preferences_rels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_preferences_rels ALTER COLUMN id SET DEFAULT nextval('public.payload_preferences_rels_id_seq'::regclass);

--
-- Name: site_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings ALTER COLUMN id SET DEFAULT nextval('public.site_settings_id_seq'::regclass);

--
-- Name: team_media id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_media ALTER COLUMN id SET DEFAULT nextval('public.team_media_id_seq'::regclass);

--
-- Name: team_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members ALTER COLUMN id SET DEFAULT nextval('public.team_members_id_seq'::regclass);

--
-- Name: team_memberships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_memberships ALTER COLUMN id SET DEFAULT nextval('public.team_memberships_id_seq'::regclass);

--
-- Name: team_scores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_scores ALTER COLUMN id SET DEFAULT nextval('public.team_scores_id_seq'::regclass);

--
-- Name: teams id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams ALTER COLUMN id SET DEFAULT nextval('public.teams_id_seq'::regclass);

--
-- Name: university_guide id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.university_guide ALTER COLUMN id SET DEFAULT nextval('public.university_guide_id_seq'::regclass);

--
-- Name: university_guide_rels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.university_guide_rels ALTER COLUMN id SET DEFAULT nextval('public.university_guide_rels_id_seq'::regclass);

--
-- Name: university_guide_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.university_guide_settings ALTER COLUMN id SET DEFAULT nextval('public.university_guide_settings_id_seq'::regclass);

--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);

--
-- Name: users_roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users_roles ALTER COLUMN id SET DEFAULT nextval('public.users_roles_id_seq'::regclass);

--
-- Name: wa_queue id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_queue ALTER COLUMN id SET DEFAULT nextval('public.wa_queue_id_seq'::regclass);

--
-- Name: whatsapp_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates ALTER COLUMN id SET DEFAULT nextval('public.whatsapp_templates_id_seq'::regclass);

--
-- Name: blocks blocks_pkey; Type: CONSTRAINT; Schema: obs; Owner: -
--

ALTER TABLE ONLY obs.blocks
    ADD CONSTRAINT blocks_pkey PRIMARY KEY (bucket, key_hash);

--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: obs; Owner: -
--

ALTER TABLE ONLY obs.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);

--
-- Name: kv kv_pkey; Type: CONSTRAINT; Schema: obs; Owner: -
--

ALTER TABLE ONLY obs.kv
    ADD CONSTRAINT kv_pkey PRIMARY KEY (key);

--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: obs; Owner: -
--

ALTER TABLE ONLY obs.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (bucket, key_hash, window_start);

--
-- Name: security_events security_events_pkey; Type: CONSTRAINT; Schema: obs; Owner: -
--

ALTER TABLE ONLY obs.security_events
    ADD CONSTRAINT security_events_pkey PRIMARY KEY (id);

--
-- Name: achievements_gallery achievements_gallery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements_gallery
    ADD CONSTRAINT achievements_gallery_pkey PRIMARY KEY (id);

--
-- Name: achievements achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_pkey PRIMARY KEY (id);

--
-- Name: analytics_events analytics_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT analytics_events_pkey PRIMARY KEY (id);

--
-- Name: blog_posts_author_links blog_posts_author_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts_author_links
    ADD CONSTRAINT blog_posts_author_links_pkey PRIMARY KEY (id);

--
-- Name: blog_posts blog_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_pkey PRIMARY KEY (id);

--
-- Name: certificates certificates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_pkey PRIMARY KEY (id);

--
-- Name: contact_messages contact_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_pkey PRIMARY KEY (id);

--
-- Name: core_team_applications core_team_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.core_team_applications
    ADD CONSTRAINT core_team_applications_pkey PRIMARY KEY (id);

--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);

--
-- Name: event_registrations_dynamic_answers event_registrations_dynamic_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_registrations_dynamic_answers
    ADD CONSTRAINT event_registrations_dynamic_answers_pkey PRIMARY KEY (id);

--
-- Name: event_registrations event_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_pkey PRIMARY KEY (id);

--
-- Name: events_external_links events_external_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_external_links
    ADD CONSTRAINT events_external_links_pkey PRIMARY KEY (id);

--
-- Name: events_gallery events_gallery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_gallery
    ADD CONSTRAINT events_gallery_pkey PRIMARY KEY (id);

--
-- Name: events_judging_criteria events_judging_criteria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_judging_criteria
    ADD CONSTRAINT events_judging_criteria_pkey PRIMARY KEY (id);

--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);

--
-- Name: events_prizes events_prizes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_prizes
    ADD CONSTRAINT events_prizes_pkey PRIMARY KEY (id);

--
-- Name: events_registration_fields_choices events_registration_fields_choices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_registration_fields_choices
    ADD CONSTRAINT events_registration_fields_choices_pkey PRIMARY KEY (id);

--
-- Name: events_registration_fields events_registration_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_registration_fields
    ADD CONSTRAINT events_registration_fields_pkey PRIMARY KEY (id);

--
-- Name: events_rels events_rels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_rels
    ADD CONSTRAINT events_rels_pkey PRIMARY KEY (id);

--
-- Name: events_results events_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_results
    ADD CONSTRAINT events_results_pkey PRIMARY KEY (id);

--
-- Name: faq_categories faq_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faq_categories
    ADD CONSTRAINT faq_categories_pkey PRIMARY KEY (id);

--
-- Name: faq faq_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faq
    ADD CONSTRAINT faq_pkey PRIMARY KEY (id);

--
-- Name: hall_of_fame hall_of_fame_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hall_of_fame
    ADD CONSTRAINT hall_of_fame_pkey PRIMARY KEY (id);

--
-- Name: jury_sessions jury_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jury_sessions
    ADD CONSTRAINT jury_sessions_pkey PRIMARY KEY (id);

--
-- Name: legal_docs legal_docs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_docs
    ADD CONSTRAINT legal_docs_pkey PRIMARY KEY (id);

--
-- Name: media media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_pkey PRIMARY KEY (id);

--
-- Name: member_applications member_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_applications
    ADD CONSTRAINT member_applications_pkey PRIMARY KEY (id);

--
-- Name: members_interests members_interests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members_interests
    ADD CONSTRAINT members_interests_pkey PRIMARY KEY (id);

--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (id);

--
-- Name: participants participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participants
    ADD CONSTRAINT participants_pkey PRIMARY KEY (id);

--
-- Name: participants_sessions participants_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participants_sessions
    ADD CONSTRAINT participants_sessions_pkey PRIMARY KEY (id);

--
-- Name: payload_kv payload_kv_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_kv
    ADD CONSTRAINT payload_kv_pkey PRIMARY KEY (id);

--
-- Name: payload_locked_documents payload_locked_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents
    ADD CONSTRAINT payload_locked_documents_pkey PRIMARY KEY (id);

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_pkey PRIMARY KEY (id);

--
-- Name: payload_migrations payload_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_migrations
    ADD CONSTRAINT payload_migrations_pkey PRIMARY KEY (id);

--
-- Name: payload_preferences payload_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_preferences
    ADD CONSTRAINT payload_preferences_pkey PRIMARY KEY (id);

--
-- Name: payload_preferences_rels payload_preferences_rels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_preferences_rels
    ADD CONSTRAINT payload_preferences_rels_pkey PRIMARY KEY (id);

--
-- Name: site_settings_core_team_areas site_settings_core_team_areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings_core_team_areas
    ADD CONSTRAINT site_settings_core_team_areas_pkey PRIMARY KEY (id);

--
-- Name: site_settings_footer_emails site_settings_footer_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings_footer_emails
    ADD CONSTRAINT site_settings_footer_emails_pkey PRIMARY KEY (id);

--
-- Name: site_settings_instagram_reels site_settings_instagram_reels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings_instagram_reels
    ADD CONSTRAINT site_settings_instagram_reels_pkey PRIMARY KEY (id);

--
-- Name: site_settings_landing_gallery site_settings_landing_gallery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings_landing_gallery
    ADD CONSTRAINT site_settings_landing_gallery_pkey PRIMARY KEY (id);

--
-- Name: site_settings_link_page_links site_settings_link_page_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings_link_page_links
    ADD CONSTRAINT site_settings_link_page_links_pkey PRIMARY KEY (id);

--
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_pkey PRIMARY KEY (id);

--
-- Name: team_media team_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_media
    ADD CONSTRAINT team_media_pkey PRIMARY KEY (id);

--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);

--
-- Name: team_memberships team_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_memberships
    ADD CONSTRAINT team_memberships_pkey PRIMARY KEY (id);

--
-- Name: team_scores team_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_scores
    ADD CONSTRAINT team_scores_pkey PRIMARY KEY (id);

--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);

--
-- Name: university_guide university_guide_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.university_guide
    ADD CONSTRAINT university_guide_pkey PRIMARY KEY (id);

--
-- Name: university_guide_rels university_guide_rels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.university_guide_rels
    ADD CONSTRAINT university_guide_rels_pkey PRIMARY KEY (id);

--
-- Name: university_guide_settings university_guide_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.university_guide_settings
    ADD CONSTRAINT university_guide_settings_pkey PRIMARY KEY (id);

--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

--
-- Name: users_roles users_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users_roles
    ADD CONSTRAINT users_roles_pkey PRIMARY KEY (id);

--
-- Name: users_sessions users_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users_sessions
    ADD CONSTRAINT users_sessions_pkey PRIMARY KEY (id);

--
-- Name: wa_queue wa_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_queue
    ADD CONSTRAINT wa_queue_pkey PRIMARY KEY (id);

--
-- Name: whatsapp_templates whatsapp_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_pkey PRIMARY KEY (id);

--
-- Name: events_kind_ts_idx; Type: INDEX; Schema: obs; Owner: -
--

CREATE INDEX events_kind_ts_idx ON obs.events USING btree (kind, ts);

--
-- Name: events_pending_idx; Type: INDEX; Schema: obs; Owner: -
--

CREATE INDEX events_pending_idx ON obs.events USING btree (id) WHERE (notify AND (notified_at IS NULL));

--
-- Name: events_ts_idx; Type: INDEX; Schema: obs; Owner: -
--

CREATE INDEX events_ts_idx ON obs.events USING btree (ts);

--
-- Name: kv_expires_idx; Type: INDEX; Schema: obs; Owner: -
--

CREATE INDEX kv_expires_idx ON obs.kv USING btree (expires_at);

--
-- Name: rate_limits_expires_idx; Type: INDEX; Schema: obs; Owner: -
--

CREATE INDEX rate_limits_expires_idx ON obs.rate_limits USING btree (expires_at);

--
-- Name: security_events_ip_hash_ts_idx; Type: INDEX; Schema: obs; Owner: -
--

CREATE INDEX security_events_ip_hash_ts_idx ON obs.security_events USING btree (ip_hash, ts);

--
-- Name: security_events_kind_ts_idx; Type: INDEX; Schema: obs; Owner: -
--

CREATE INDEX security_events_kind_ts_idx ON obs.security_events USING btree (kind, ts);

--
-- Name: security_events_ts_idx; Type: INDEX; Schema: obs; Owner: -
--

CREATE INDEX security_events_ts_idx ON obs.security_events USING btree (ts);

--
-- Name: achievements_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX achievements_created_at_idx ON public.achievements USING btree (created_at);

--
-- Name: achievements_gallery_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX achievements_gallery_image_idx ON public.achievements_gallery USING btree (image_id);

--
-- Name: achievements_gallery_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX achievements_gallery_order_idx ON public.achievements_gallery USING btree (_order);

--
-- Name: achievements_gallery_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX achievements_gallery_parent_id_idx ON public.achievements_gallery USING btree (_parent_id);

--
-- Name: achievements_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX achievements_image_idx ON public.achievements USING btree (image_id);

--
-- Name: achievements_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX achievements_slug_idx ON public.achievements USING btree (slug);

--
-- Name: achievements_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX achievements_updated_at_idx ON public.achievements USING btree (updated_at);

--
-- Name: analytics_events_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX analytics_events_entity_idx ON public.analytics_events USING btree (entity_type, entity_id);

--
-- Name: analytics_events_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX analytics_events_ref_idx ON public.analytics_events USING btree (ref) WHERE (ref IS NOT NULL);

--
-- Name: analytics_events_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX analytics_events_ts_idx ON public.analytics_events USING btree (ts);

--
-- Name: analytics_events_type_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX analytics_events_type_ts_idx ON public.analytics_events USING btree (type, ts);

--
-- Name: blog_posts_author_author_profile_picture_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_posts_author_author_profile_picture_idx ON public.blog_posts USING btree (author_profile_picture_id);

--
-- Name: blog_posts_author_links_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_posts_author_links_order_idx ON public.blog_posts_author_links USING btree (_order);

--
-- Name: blog_posts_author_links_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_posts_author_links_parent_id_idx ON public.blog_posts_author_links USING btree (_parent_id);

--
-- Name: blog_posts_cover_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_posts_cover_image_idx ON public.blog_posts USING btree (cover_image_id);

--
-- Name: blog_posts_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_posts_created_at_idx ON public.blog_posts USING btree (created_at);

--
-- Name: blog_posts_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX blog_posts_slug_idx ON public.blog_posts USING btree (slug);

--
-- Name: blog_posts_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_posts_updated_at_idx ON public.blog_posts USING btree (updated_at);

--
-- Name: certificates_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX certificates_code_idx ON public.certificates USING btree (code);

--
-- Name: certificates_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX certificates_created_at_idx ON public.certificates USING btree (created_at);

--
-- Name: certificates_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX certificates_event_idx ON public.certificates USING btree (event_id);

--
-- Name: certificates_image_file_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX certificates_image_file_idx ON public.certificates USING btree (image_file_id);

--
-- Name: certificates_pdf_file_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX certificates_pdf_file_idx ON public.certificates USING btree (pdf_file_id);

--
-- Name: certificates_registration_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX certificates_registration_idx ON public.certificates USING btree (registration_id);

--
-- Name: certificates_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX certificates_updated_at_idx ON public.certificates USING btree (updated_at);

--
-- Name: contact_messages_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_messages_created_at_idx ON public.contact_messages USING btree (created_at);

--
-- Name: contact_messages_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_messages_updated_at_idx ON public.contact_messages USING btree (updated_at);

--
-- Name: core_team_applications_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX core_team_applications_created_at_idx ON public.core_team_applications USING btree (created_at);

--
-- Name: core_team_applications_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX core_team_applications_updated_at_idx ON public.core_team_applications USING btree (updated_at);

--
-- Name: email_templates_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_templates_created_at_idx ON public.email_templates USING btree (created_at);

--
-- Name: email_templates_related_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_templates_related_event_idx ON public.email_templates USING btree (related_event_id);

--
-- Name: email_templates_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_templates_updated_at_idx ON public.email_templates USING btree (updated_at);

--
-- Name: event_registrations_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_registrations_created_at_idx ON public.event_registrations USING btree (created_at);

--
-- Name: event_registrations_dynamic_answers_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_registrations_dynamic_answers_order_idx ON public.event_registrations_dynamic_answers USING btree (_order);

--
-- Name: event_registrations_dynamic_answers_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_registrations_dynamic_answers_parent_id_idx ON public.event_registrations_dynamic_answers USING btree (_parent_id);

--
-- Name: event_registrations_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_registrations_event_idx ON public.event_registrations USING btree (event_id);

--
-- Name: event_registrations_ticket_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX event_registrations_ticket_token_idx ON public.event_registrations USING btree (ticket_token);

--
-- Name: event_registrations_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_registrations_updated_at_idx ON public.event_registrations USING btree (updated_at);

--
-- Name: events_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_created_at_idx ON public.events USING btree (created_at);

--
-- Name: events_external_links_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_external_links_order_idx ON public.events_external_links USING btree (_order);

--
-- Name: events_external_links_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_external_links_parent_id_idx ON public.events_external_links USING btree (_parent_id);

--
-- Name: events_gallery_media_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_gallery_media_idx ON public.events_gallery USING btree (media_id);

--
-- Name: events_gallery_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_gallery_order_idx ON public.events_gallery USING btree (_order);

--
-- Name: events_gallery_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_gallery_parent_id_idx ON public.events_gallery USING btree (_parent_id);

--
-- Name: events_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_image_idx ON public.events USING btree (image_id);

--
-- Name: events_judging_criteria_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_judging_criteria_order_idx ON public.events_judging_criteria USING btree (_order);

--
-- Name: events_judging_criteria_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_judging_criteria_parent_id_idx ON public.events_judging_criteria USING btree (_parent_id);

--
-- Name: events_prizes_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_prizes_image_idx ON public.events_prizes USING btree (image_id);

--
-- Name: events_prizes_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_prizes_order_idx ON public.events_prizes USING btree (_order);

--
-- Name: events_prizes_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_prizes_parent_id_idx ON public.events_prizes USING btree (_parent_id);

--
-- Name: events_registration_fields_choices_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_registration_fields_choices_image_idx ON public.events_registration_fields_choices USING btree (image_id);

--
-- Name: events_registration_fields_choices_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_registration_fields_choices_order_idx ON public.events_registration_fields_choices USING btree (_order);

--
-- Name: events_registration_fields_choices_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_registration_fields_choices_parent_id_idx ON public.events_registration_fields_choices USING btree (_parent_id);

--
-- Name: events_registration_fields_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_registration_fields_image_idx ON public.events_registration_fields USING btree (image_id);

--
-- Name: events_registration_fields_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_registration_fields_order_idx ON public.events_registration_fields USING btree (_order);

--
-- Name: events_registration_fields_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_registration_fields_parent_id_idx ON public.events_registration_fields USING btree (_parent_id);

--
-- Name: events_rels_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_rels_order_idx ON public.events_rels USING btree ("order");

--
-- Name: events_rels_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_rels_parent_idx ON public.events_rels USING btree (parent_id);

--
-- Name: events_rels_participants_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_rels_participants_id_idx ON public.events_rels USING btree (participants_id);

--
-- Name: events_rels_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_rels_path_idx ON public.events_rels USING btree (path);

--
-- Name: events_results_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_results_order_idx ON public.events_results USING btree (_order);

--
-- Name: events_results_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_results_parent_id_idx ON public.events_results USING btree (_parent_id);

--
-- Name: events_results_team_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_results_team_idx ON public.events_results USING btree (team_id);

--
-- Name: events_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_updated_at_idx ON public.events USING btree (updated_at);

--
-- Name: faq__order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faq__order_idx ON public.faq USING btree (_order);

--
-- Name: faq_categories__order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faq_categories__order_idx ON public.faq_categories USING btree (_order);

--
-- Name: faq_categories_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faq_categories_created_at_idx ON public.faq_categories USING btree (created_at);

--
-- Name: faq_categories_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faq_categories_updated_at_idx ON public.faq_categories USING btree (updated_at);

--
-- Name: faq_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faq_category_idx ON public.faq USING btree (category_id);

--
-- Name: faq_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faq_created_at_idx ON public.faq USING btree (created_at);

--
-- Name: faq_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faq_updated_at_idx ON public.faq USING btree (updated_at);

--
-- Name: hall_of_fame_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hall_of_fame_created_at_idx ON public.hall_of_fame USING btree (created_at);

--
-- Name: hall_of_fame_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hall_of_fame_image_idx ON public.hall_of_fame USING btree (image_id);

--
-- Name: hall_of_fame_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hall_of_fame_updated_at_idx ON public.hall_of_fame USING btree (updated_at);

--
-- Name: jury_sessions_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jury_sessions_created_at_idx ON public.jury_sessions USING btree (created_at);

--
-- Name: jury_sessions_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX jury_sessions_event_idx ON public.jury_sessions USING btree (event_id);

--
-- Name: jury_sessions_host_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jury_sessions_host_idx ON public.jury_sessions USING btree (host_id);

--
-- Name: jury_sessions_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jury_sessions_updated_at_idx ON public.jury_sessions USING btree (updated_at);

--
-- Name: media_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_created_at_idx ON public.media USING btree (created_at);

--
-- Name: media_filename_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX media_filename_idx ON public.media USING btree (filename);

--
-- Name: media_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_updated_at_idx ON public.media USING btree (updated_at);

--
-- Name: member_applications_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX member_applications_created_at_idx ON public.member_applications USING btree (created_at);

--
-- Name: member_applications_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX member_applications_updated_at_idx ON public.member_applications USING btree (updated_at);

--
-- Name: members_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX members_created_at_idx ON public.members USING btree (created_at);

--
-- Name: members_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX members_email_idx ON public.members USING btree (email);

--
-- Name: members_interests_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX members_interests_order_idx ON public.members_interests USING btree (_order);

--
-- Name: members_interests_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX members_interests_parent_id_idx ON public.members_interests USING btree (_parent_id);

--
-- Name: members_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX members_updated_at_idx ON public.members USING btree (updated_at);

--
-- Name: participants_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX participants_created_at_idx ON public.participants USING btree (created_at);

--
-- Name: participants_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX participants_email_idx ON public.participants USING btree (email);

--
-- Name: participants_sessions_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX participants_sessions_order_idx ON public.participants_sessions USING btree (_order);

--
-- Name: participants_sessions_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX participants_sessions_parent_id_idx ON public.participants_sessions USING btree (_parent_id);

--
-- Name: participants_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX participants_updated_at_idx ON public.participants USING btree (updated_at);

--
-- Name: payload_kv_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payload_kv_key_idx ON public.payload_kv USING btree (key);

--
-- Name: payload_locked_documents_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_created_at_idx ON public.payload_locked_documents USING btree (created_at);

--
-- Name: payload_locked_documents_global_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_global_slug_idx ON public.payload_locked_documents USING btree (global_slug);

--
-- Name: payload_locked_documents_rels_achievements_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_achievements_id_idx ON public.payload_locked_documents_rels USING btree (achievements_id);

--
-- Name: payload_locked_documents_rels_blog_posts_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_blog_posts_id_idx ON public.payload_locked_documents_rels USING btree (blog_posts_id);

--
-- Name: payload_locked_documents_rels_certificates_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_certificates_id_idx ON public.payload_locked_documents_rels USING btree (certificates_id);

--
-- Name: payload_locked_documents_rels_contact_messages_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_contact_messages_id_idx ON public.payload_locked_documents_rels USING btree (contact_messages_id);

--
-- Name: payload_locked_documents_rels_core_team_applications_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_core_team_applications_id_idx ON public.payload_locked_documents_rels USING btree (core_team_applications_id);

--
-- Name: payload_locked_documents_rels_email_templates_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_email_templates_id_idx ON public.payload_locked_documents_rels USING btree (email_templates_id);

--
-- Name: payload_locked_documents_rels_event_registrations_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_event_registrations_id_idx ON public.payload_locked_documents_rels USING btree (event_registrations_id);

--
-- Name: payload_locked_documents_rels_events_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_events_id_idx ON public.payload_locked_documents_rels USING btree (events_id);

--
-- Name: payload_locked_documents_rels_faq_categories_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_faq_categories_id_idx ON public.payload_locked_documents_rels USING btree (faq_categories_id);

--
-- Name: payload_locked_documents_rels_faq_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_faq_id_idx ON public.payload_locked_documents_rels USING btree (faq_id);

--
-- Name: payload_locked_documents_rels_hall_of_fame_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_hall_of_fame_id_idx ON public.payload_locked_documents_rels USING btree (hall_of_fame_id);

--
-- Name: payload_locked_documents_rels_jury_sessions_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_jury_sessions_id_idx ON public.payload_locked_documents_rels USING btree (jury_sessions_id);

--
-- Name: payload_locked_documents_rels_media_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_media_id_idx ON public.payload_locked_documents_rels USING btree (media_id);

--
-- Name: payload_locked_documents_rels_member_applications_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_member_applications_id_idx ON public.payload_locked_documents_rels USING btree (member_applications_id);

--
-- Name: payload_locked_documents_rels_members_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_members_id_idx ON public.payload_locked_documents_rels USING btree (members_id);

--
-- Name: payload_locked_documents_rels_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_order_idx ON public.payload_locked_documents_rels USING btree ("order");

--
-- Name: payload_locked_documents_rels_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_parent_idx ON public.payload_locked_documents_rels USING btree (parent_id);

--
-- Name: payload_locked_documents_rels_participants_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_participants_id_idx ON public.payload_locked_documents_rels USING btree (participants_id);

--
-- Name: payload_locked_documents_rels_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_path_idx ON public.payload_locked_documents_rels USING btree (path);

--
-- Name: payload_locked_documents_rels_team_media_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_team_media_id_idx ON public.payload_locked_documents_rels USING btree (team_media_id);

--
-- Name: payload_locked_documents_rels_team_members_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_team_members_id_idx ON public.payload_locked_documents_rels USING btree (team_members_id);

--
-- Name: payload_locked_documents_rels_team_memberships_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_team_memberships_id_idx ON public.payload_locked_documents_rels USING btree (team_memberships_id);

--
-- Name: payload_locked_documents_rels_team_scores_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_team_scores_id_idx ON public.payload_locked_documents_rels USING btree (team_scores_id);

--
-- Name: payload_locked_documents_rels_teams_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_teams_id_idx ON public.payload_locked_documents_rels USING btree (teams_id);

--
-- Name: payload_locked_documents_rels_university_guide_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_university_guide_id_idx ON public.payload_locked_documents_rels USING btree (university_guide_id);

--
-- Name: payload_locked_documents_rels_users_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_users_id_idx ON public.payload_locked_documents_rels USING btree (users_id);

--
-- Name: payload_locked_documents_rels_wa_queue_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_wa_queue_id_idx ON public.payload_locked_documents_rels USING btree (wa_queue_id);

--
-- Name: payload_locked_documents_rels_whatsapp_templates_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_rels_whatsapp_templates_id_idx ON public.payload_locked_documents_rels USING btree (whatsapp_templates_id);

--
-- Name: payload_locked_documents_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_locked_documents_updated_at_idx ON public.payload_locked_documents USING btree (updated_at);

--
-- Name: payload_migrations_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_migrations_created_at_idx ON public.payload_migrations USING btree (created_at);

--
-- Name: payload_migrations_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_migrations_updated_at_idx ON public.payload_migrations USING btree (updated_at);

--
-- Name: payload_preferences_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_preferences_created_at_idx ON public.payload_preferences USING btree (created_at);

--
-- Name: payload_preferences_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_preferences_key_idx ON public.payload_preferences USING btree (key);

--
-- Name: payload_preferences_rels_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_preferences_rels_order_idx ON public.payload_preferences_rels USING btree ("order");

--
-- Name: payload_preferences_rels_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_preferences_rels_parent_idx ON public.payload_preferences_rels USING btree (parent_id);

--
-- Name: payload_preferences_rels_participants_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_preferences_rels_participants_id_idx ON public.payload_preferences_rels USING btree (participants_id);

--
-- Name: payload_preferences_rels_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_preferences_rels_path_idx ON public.payload_preferences_rels USING btree (path);

--
-- Name: payload_preferences_rels_users_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_preferences_rels_users_id_idx ON public.payload_preferences_rels USING btree (users_id);

--
-- Name: payload_preferences_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payload_preferences_updated_at_idx ON public.payload_preferences USING btree (updated_at);

--
-- Name: site_settings_core_team_areas_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX site_settings_core_team_areas_order_idx ON public.site_settings_core_team_areas USING btree (_order);

--
-- Name: site_settings_core_team_areas_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX site_settings_core_team_areas_parent_id_idx ON public.site_settings_core_team_areas USING btree (_parent_id);

--
-- Name: site_settings_featured_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX site_settings_featured_event_idx ON public.site_settings USING btree (featured_event_id);

--
-- Name: site_settings_footer_emails_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX site_settings_footer_emails_order_idx ON public.site_settings_footer_emails USING btree (_order);

--
-- Name: site_settings_footer_emails_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX site_settings_footer_emails_parent_id_idx ON public.site_settings_footer_emails USING btree (_parent_id);

--
-- Name: site_settings_instagram_reels_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX site_settings_instagram_reels_order_idx ON public.site_settings_instagram_reels USING btree (_order);

--
-- Name: site_settings_instagram_reels_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX site_settings_instagram_reels_parent_id_idx ON public.site_settings_instagram_reels USING btree (_parent_id);

--
-- Name: site_settings_instagram_reels_video_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX site_settings_instagram_reels_video_idx ON public.site_settings_instagram_reels USING btree (video_id);

--
-- Name: site_settings_landing_gallery_media_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX site_settings_landing_gallery_media_idx ON public.site_settings_landing_gallery USING btree (media_id);

--
-- Name: site_settings_landing_gallery_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX site_settings_landing_gallery_order_idx ON public.site_settings_landing_gallery USING btree (_order);

--
-- Name: site_settings_landing_gallery_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX site_settings_landing_gallery_parent_id_idx ON public.site_settings_landing_gallery USING btree (_parent_id);

--
-- Name: site_settings_link_page_links_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX site_settings_link_page_links_order_idx ON public.site_settings_link_page_links USING btree (_order);

--
-- Name: site_settings_link_page_links_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX site_settings_link_page_links_parent_id_idx ON public.site_settings_link_page_links USING btree (_parent_id);

--
-- Name: team_media_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_media_created_at_idx ON public.team_media USING btree (created_at);

--
-- Name: team_media_filename_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX team_media_filename_idx ON public.team_media USING btree (filename);

--
-- Name: team_media_team_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_media_team_idx ON public.team_media USING btree (team_id);

--
-- Name: team_media_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_media_updated_at_idx ON public.team_media USING btree (updated_at);

--
-- Name: team_media_uploaded_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_media_uploaded_by_idx ON public.team_media USING btree (uploaded_by_id);

--
-- Name: team_members_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_members_created_at_idx ON public.team_members USING btree (created_at);

--
-- Name: team_members_photo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_members_photo_idx ON public.team_members USING btree (photo_id);

--
-- Name: team_members_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_members_updated_at_idx ON public.team_members USING btree (updated_at);

--
-- Name: team_memberships_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_memberships_created_at_idx ON public.team_memberships USING btree (created_at);

--
-- Name: team_memberships_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_memberships_event_idx ON public.team_memberships USING btree (event_id);

--
-- Name: team_memberships_participant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_memberships_participant_idx ON public.team_memberships USING btree (participant_id);

--
-- Name: team_memberships_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_memberships_status_idx ON public.team_memberships USING btree (status);

--
-- Name: team_memberships_team_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_memberships_team_idx ON public.team_memberships USING btree (team_id);

--
-- Name: team_memberships_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_memberships_updated_at_idx ON public.team_memberships USING btree (updated_at);

--
-- Name: team_scores_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_scores_created_at_idx ON public.team_scores USING btree (created_at);

--
-- Name: team_scores_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_scores_event_idx ON public.team_scores USING btree (event_id);

--
-- Name: team_scores_judge_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_scores_judge_idx ON public.team_scores USING btree (judge_id);

--
-- Name: team_scores_team_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_scores_team_idx ON public.team_scores USING btree (team_id);

--
-- Name: team_scores_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_scores_updated_at_idx ON public.team_scores USING btree (updated_at);

--
-- Name: teams_captain_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX teams_captain_idx ON public.teams USING btree (captain_id);

--
-- Name: teams_cover_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX teams_cover_idx ON public.teams USING btree (cover_id);

--
-- Name: teams_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX teams_created_at_idx ON public.teams USING btree (created_at);

--
-- Name: teams_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX teams_event_idx ON public.teams USING btree (event_id);

--
-- Name: teams_invite_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX teams_invite_code_idx ON public.teams USING btree (invite_code);

--
-- Name: teams_logo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX teams_logo_idx ON public.teams USING btree (logo_id);

--
-- Name: teams_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX teams_slug_idx ON public.teams USING btree (slug);

--
-- Name: teams_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX teams_status_idx ON public.teams USING btree (status);

--
-- Name: teams_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX teams_updated_at_idx ON public.teams USING btree (updated_at);

--
-- Name: university_guide_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX university_guide_created_at_idx ON public.university_guide USING btree (created_at);

--
-- Name: university_guide_rels_blog_posts_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX university_guide_rels_blog_posts_id_idx ON public.university_guide_rels USING btree (blog_posts_id);

--
-- Name: university_guide_rels_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX university_guide_rels_order_idx ON public.university_guide_rels USING btree ("order");

--
-- Name: university_guide_rels_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX university_guide_rels_parent_idx ON public.university_guide_rels USING btree (parent_id);

--
-- Name: university_guide_rels_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX university_guide_rels_path_idx ON public.university_guide_rels USING btree (path);

--
-- Name: university_guide_settings_start_reading_link_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX university_guide_settings_start_reading_link_idx ON public.university_guide_settings USING btree (start_reading_link_id);

--
-- Name: university_guide_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX university_guide_slug_idx ON public.university_guide USING btree (slug);

--
-- Name: university_guide_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX university_guide_updated_at_idx ON public.university_guide USING btree (updated_at);

--
-- Name: users_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_created_at_idx ON public.users USING btree (created_at);

--
-- Name: users_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_idx ON public.users USING btree (email);

--
-- Name: users_roles_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_roles_order_idx ON public.users_roles USING btree ("order");

--
-- Name: users_roles_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_roles_parent_idx ON public.users_roles USING btree (parent_id);

--
-- Name: users_sessions_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_sessions_order_idx ON public.users_sessions USING btree (_order);

--
-- Name: users_sessions_parent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_sessions_parent_id_idx ON public.users_sessions USING btree (_parent_id);

--
-- Name: users_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_updated_at_idx ON public.users USING btree (updated_at);

--
-- Name: wa_queue_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wa_queue_created_at_idx ON public.wa_queue USING btree (created_at);

--
-- Name: wa_queue_related_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wa_queue_related_event_idx ON public.wa_queue USING btree (related_event_id);

--
-- Name: wa_queue_related_registration_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wa_queue_related_registration_idx ON public.wa_queue USING btree (related_registration_id);

--
-- Name: wa_queue_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wa_queue_status_idx ON public.wa_queue USING btree (status);

--
-- Name: wa_queue_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wa_queue_updated_at_idx ON public.wa_queue USING btree (updated_at);

--
-- Name: whatsapp_templates_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_templates_created_at_idx ON public.whatsapp_templates USING btree (created_at);

--
-- Name: whatsapp_templates_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_templates_updated_at_idx ON public.whatsapp_templates USING btree (updated_at);

--
-- Name: achievements_gallery achievements_gallery_image_id_media_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements_gallery
    ADD CONSTRAINT achievements_gallery_image_id_media_id_fk FOREIGN KEY (image_id) REFERENCES public.media(id) ON DELETE SET NULL;

--
-- Name: achievements_gallery achievements_gallery_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements_gallery
    ADD CONSTRAINT achievements_gallery_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.achievements(id) ON DELETE CASCADE;

--
-- Name: achievements achievements_image_id_media_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_image_id_media_id_fk FOREIGN KEY (image_id) REFERENCES public.media(id) ON DELETE SET NULL;

--
-- Name: blog_posts_author_links blog_posts_author_links_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts_author_links
    ADD CONSTRAINT blog_posts_author_links_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.blog_posts(id) ON DELETE CASCADE;

--
-- Name: blog_posts blog_posts_author_profile_picture_id_media_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_author_profile_picture_id_media_id_fk FOREIGN KEY (author_profile_picture_id) REFERENCES public.media(id) ON DELETE SET NULL;

--
-- Name: blog_posts blog_posts_cover_image_id_media_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_cover_image_id_media_id_fk FOREIGN KEY (cover_image_id) REFERENCES public.media(id) ON DELETE SET NULL;

--
-- Name: certificates certificates_event_id_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_event_id_events_id_fk FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;

--
-- Name: certificates certificates_image_file_id_media_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_image_file_id_media_id_fk FOREIGN KEY (image_file_id) REFERENCES public.media(id) ON DELETE SET NULL;

--
-- Name: certificates certificates_pdf_file_id_media_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_pdf_file_id_media_id_fk FOREIGN KEY (pdf_file_id) REFERENCES public.media(id) ON DELETE SET NULL;

--
-- Name: certificates certificates_registration_id_event_registrations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_registration_id_event_registrations_id_fk FOREIGN KEY (registration_id) REFERENCES public.event_registrations(id) ON DELETE SET NULL;

--
-- Name: email_templates email_templates_related_event_id_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_related_event_id_events_id_fk FOREIGN KEY (related_event_id) REFERENCES public.events(id) ON DELETE SET NULL;

--
-- Name: event_registrations_dynamic_answers event_registrations_dynamic_answers_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_registrations_dynamic_answers
    ADD CONSTRAINT event_registrations_dynamic_answers_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.event_registrations(id) ON DELETE CASCADE;

--
-- Name: event_registrations event_registrations_event_id_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_event_id_events_id_fk FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;

--
-- Name: events_external_links events_external_links_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_external_links
    ADD CONSTRAINT events_external_links_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.events(id) ON DELETE CASCADE;

--
-- Name: events_gallery events_gallery_media_id_media_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_gallery
    ADD CONSTRAINT events_gallery_media_id_media_id_fk FOREIGN KEY (media_id) REFERENCES public.media(id) ON DELETE SET NULL;

--
-- Name: events_gallery events_gallery_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_gallery
    ADD CONSTRAINT events_gallery_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.events(id) ON DELETE CASCADE;

--
-- Name: events events_image_id_media_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_image_id_media_id_fk FOREIGN KEY (image_id) REFERENCES public.media(id) ON DELETE SET NULL;

--
-- Name: events_judging_criteria events_judging_criteria_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_judging_criteria
    ADD CONSTRAINT events_judging_criteria_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.events(id) ON DELETE CASCADE;

--
-- Name: events_prizes events_prizes_image_id_media_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_prizes
    ADD CONSTRAINT events_prizes_image_id_media_id_fk FOREIGN KEY (image_id) REFERENCES public.media(id) ON DELETE SET NULL;

--
-- Name: events_prizes events_prizes_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_prizes
    ADD CONSTRAINT events_prizes_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.events(id) ON DELETE CASCADE;

--
-- Name: events_registration_fields_choices events_registration_fields_choices_image_id_media_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_registration_fields_choices
    ADD CONSTRAINT events_registration_fields_choices_image_id_media_id_fk FOREIGN KEY (image_id) REFERENCES public.media(id) ON DELETE SET NULL;

--
-- Name: events_registration_fields_choices events_registration_fields_choices_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_registration_fields_choices
    ADD CONSTRAINT events_registration_fields_choices_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.events_registration_fields(id) ON DELETE CASCADE;

--
-- Name: events_registration_fields events_registration_fields_image_id_media_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_registration_fields
    ADD CONSTRAINT events_registration_fields_image_id_media_id_fk FOREIGN KEY (image_id) REFERENCES public.media(id) ON DELETE SET NULL;

--
-- Name: events_registration_fields events_registration_fields_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_registration_fields
    ADD CONSTRAINT events_registration_fields_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.events(id) ON DELETE CASCADE;

--
-- Name: events_rels events_rels_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_rels
    ADD CONSTRAINT events_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES public.events(id) ON DELETE CASCADE;

--
-- Name: events_rels events_rels_participants_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_rels
    ADD CONSTRAINT events_rels_participants_fk FOREIGN KEY (participants_id) REFERENCES public.participants(id) ON DELETE CASCADE;

--
-- Name: events_results events_results_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_results
    ADD CONSTRAINT events_results_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.events(id) ON DELETE CASCADE;

--
-- Name: events_results events_results_team_id_teams_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_results
    ADD CONSTRAINT events_results_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

--
-- Name: faq faq_category_id_faq_categories_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faq
    ADD CONSTRAINT faq_category_id_faq_categories_id_fk FOREIGN KEY (category_id) REFERENCES public.faq_categories(id) ON DELETE SET NULL;

--
-- Name: hall_of_fame hall_of_fame_image_id_media_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hall_of_fame
    ADD CONSTRAINT hall_of_fame_image_id_media_id_fk FOREIGN KEY (image_id) REFERENCES public.media(id) ON DELETE SET NULL;

--
-- Name: jury_sessions jury_sessions_event_id_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jury_sessions
    ADD CONSTRAINT jury_sessions_event_id_events_id_fk FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;

--
-- Name: jury_sessions jury_sessions_host_id_participants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jury_sessions
    ADD CONSTRAINT jury_sessions_host_id_participants_id_fk FOREIGN KEY (host_id) REFERENCES public.participants(id) ON DELETE SET NULL;

--
-- Name: members_interests members_interests_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members_interests
    ADD CONSTRAINT members_interests_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.members(id) ON DELETE CASCADE;

--
-- Name: participants_sessions participants_sessions_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participants_sessions
    ADD CONSTRAINT participants_sessions_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.participants(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_achievements_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_achievements_fk FOREIGN KEY (achievements_id) REFERENCES public.achievements(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_blog_posts_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_blog_posts_fk FOREIGN KEY (blog_posts_id) REFERENCES public.blog_posts(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_certificates_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_certificates_fk FOREIGN KEY (certificates_id) REFERENCES public.certificates(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_contact_messages_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_contact_messages_fk FOREIGN KEY (contact_messages_id) REFERENCES public.contact_messages(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_core_team_applications_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_core_team_applications_fk FOREIGN KEY (core_team_applications_id) REFERENCES public.core_team_applications(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_email_templates_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_email_templates_fk FOREIGN KEY (email_templates_id) REFERENCES public.email_templates(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_event_registrations_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_event_registrations_fk FOREIGN KEY (event_registrations_id) REFERENCES public.event_registrations(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_events_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_events_fk FOREIGN KEY (events_id) REFERENCES public.events(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_faq_categories_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_faq_categories_fk FOREIGN KEY (faq_categories_id) REFERENCES public.faq_categories(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_faq_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_faq_fk FOREIGN KEY (faq_id) REFERENCES public.faq(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_hall_of_fame_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_hall_of_fame_fk FOREIGN KEY (hall_of_fame_id) REFERENCES public.hall_of_fame(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_jury_sessions_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_jury_sessions_fk FOREIGN KEY (jury_sessions_id) REFERENCES public.jury_sessions(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_media_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_media_fk FOREIGN KEY (media_id) REFERENCES public.media(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_member_applications_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_member_applications_fk FOREIGN KEY (member_applications_id) REFERENCES public.member_applications(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_members_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_members_fk FOREIGN KEY (members_id) REFERENCES public.members(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES public.payload_locked_documents(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_participants_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_participants_fk FOREIGN KEY (participants_id) REFERENCES public.participants(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_team_media_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_team_media_fk FOREIGN KEY (team_media_id) REFERENCES public.team_media(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_team_members_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_team_members_fk FOREIGN KEY (team_members_id) REFERENCES public.team_members(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_team_memberships_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_team_memberships_fk FOREIGN KEY (team_memberships_id) REFERENCES public.team_memberships(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_team_scores_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_team_scores_fk FOREIGN KEY (team_scores_id) REFERENCES public.team_scores(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_teams_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_teams_fk FOREIGN KEY (teams_id) REFERENCES public.teams(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_university_guide_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_university_guide_fk FOREIGN KEY (university_guide_id) REFERENCES public.university_guide(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_users_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_users_fk FOREIGN KEY (users_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_wa_queue_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_wa_queue_fk FOREIGN KEY (wa_queue_id) REFERENCES public.wa_queue(id) ON DELETE CASCADE;

--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_whatsapp_templates_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_whatsapp_templates_fk FOREIGN KEY (whatsapp_templates_id) REFERENCES public.whatsapp_templates(id) ON DELETE CASCADE;

--
-- Name: payload_preferences_rels payload_preferences_rels_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_preferences_rels
    ADD CONSTRAINT payload_preferences_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES public.payload_preferences(id) ON DELETE CASCADE;

--
-- Name: payload_preferences_rels payload_preferences_rels_participants_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_preferences_rels
    ADD CONSTRAINT payload_preferences_rels_participants_fk FOREIGN KEY (participants_id) REFERENCES public.participants(id) ON DELETE CASCADE;

--
-- Name: payload_preferences_rels payload_preferences_rels_users_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payload_preferences_rels
    ADD CONSTRAINT payload_preferences_rels_users_fk FOREIGN KEY (users_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: site_settings_core_team_areas site_settings_core_team_areas_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings_core_team_areas
    ADD CONSTRAINT site_settings_core_team_areas_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.site_settings(id) ON DELETE CASCADE;

--
-- Name: site_settings site_settings_featured_event_id_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_featured_event_id_events_id_fk FOREIGN KEY (featured_event_id) REFERENCES public.events(id) ON DELETE SET NULL;

--
-- Name: site_settings_footer_emails site_settings_footer_emails_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings_footer_emails
    ADD CONSTRAINT site_settings_footer_emails_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.site_settings(id) ON DELETE CASCADE;

--
-- Name: site_settings_instagram_reels site_settings_instagram_reels_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings_instagram_reels
    ADD CONSTRAINT site_settings_instagram_reels_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.site_settings(id) ON DELETE CASCADE;

--
-- Name: site_settings_instagram_reels site_settings_instagram_reels_video_id_media_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings_instagram_reels
    ADD CONSTRAINT site_settings_instagram_reels_video_id_media_id_fk FOREIGN KEY (video_id) REFERENCES public.media(id) ON DELETE SET NULL;

--
-- Name: site_settings_landing_gallery site_settings_landing_gallery_media_id_media_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings_landing_gallery
    ADD CONSTRAINT site_settings_landing_gallery_media_id_media_id_fk FOREIGN KEY (media_id) REFERENCES public.media(id) ON DELETE SET NULL;

--
-- Name: site_settings_landing_gallery site_settings_landing_gallery_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings_landing_gallery
    ADD CONSTRAINT site_settings_landing_gallery_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.site_settings(id) ON DELETE CASCADE;

--
-- Name: site_settings_link_page_links site_settings_link_page_links_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings_link_page_links
    ADD CONSTRAINT site_settings_link_page_links_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.site_settings(id) ON DELETE CASCADE;

--
-- Name: team_media team_media_team_id_teams_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_media
    ADD CONSTRAINT team_media_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

--
-- Name: team_media team_media_uploaded_by_id_participants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_media
    ADD CONSTRAINT team_media_uploaded_by_id_participants_id_fk FOREIGN KEY (uploaded_by_id) REFERENCES public.participants(id) ON DELETE SET NULL;

--
-- Name: team_members team_members_photo_id_media_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_photo_id_media_id_fk FOREIGN KEY (photo_id) REFERENCES public.media(id) ON DELETE SET NULL;

--
-- Name: team_memberships team_memberships_event_id_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_memberships
    ADD CONSTRAINT team_memberships_event_id_events_id_fk FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;

--
-- Name: team_memberships team_memberships_participant_id_participants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_memberships
    ADD CONSTRAINT team_memberships_participant_id_participants_id_fk FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE SET NULL;

--
-- Name: team_memberships team_memberships_team_id_teams_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_memberships
    ADD CONSTRAINT team_memberships_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

--
-- Name: team_scores team_scores_event_id_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_scores
    ADD CONSTRAINT team_scores_event_id_events_id_fk FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;

--
-- Name: team_scores team_scores_judge_id_participants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_scores
    ADD CONSTRAINT team_scores_judge_id_participants_id_fk FOREIGN KEY (judge_id) REFERENCES public.participants(id) ON DELETE SET NULL;

--
-- Name: team_scores team_scores_team_id_teams_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_scores
    ADD CONSTRAINT team_scores_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

--
-- Name: teams teams_captain_id_participants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_captain_id_participants_id_fk FOREIGN KEY (captain_id) REFERENCES public.participants(id) ON DELETE SET NULL;

--
-- Name: teams teams_cover_id_team_media_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_cover_id_team_media_id_fk FOREIGN KEY (cover_id) REFERENCES public.team_media(id) ON DELETE SET NULL;

--
-- Name: teams teams_event_id_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_event_id_events_id_fk FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;

--
-- Name: teams teams_logo_id_team_media_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_logo_id_team_media_id_fk FOREIGN KEY (logo_id) REFERENCES public.team_media(id) ON DELETE SET NULL;

--
-- Name: university_guide_rels university_guide_rels_blog_posts_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.university_guide_rels
    ADD CONSTRAINT university_guide_rels_blog_posts_fk FOREIGN KEY (blog_posts_id) REFERENCES public.blog_posts(id) ON DELETE CASCADE;

--
-- Name: university_guide_rels university_guide_rels_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.university_guide_rels
    ADD CONSTRAINT university_guide_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES public.university_guide(id) ON DELETE CASCADE;

--
-- Name: university_guide_settings university_guide_settings_start_reading_link_id_university_guid; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.university_guide_settings
    ADD CONSTRAINT university_guide_settings_start_reading_link_id_university_guid FOREIGN KEY (start_reading_link_id) REFERENCES public.university_guide(id) ON DELETE SET NULL;

--
-- Name: users_roles users_roles_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users_roles
    ADD CONSTRAINT users_roles_parent_fk FOREIGN KEY (parent_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: users_sessions users_sessions_parent_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users_sessions
    ADD CONSTRAINT users_sessions_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: wa_queue wa_queue_related_event_id_events_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_queue
    ADD CONSTRAINT wa_queue_related_event_id_events_id_fk FOREIGN KEY (related_event_id) REFERENCES public.events(id) ON DELETE SET NULL;

--
-- Name: wa_queue wa_queue_related_registration_id_event_registrations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wa_queue
    ADD CONSTRAINT wa_queue_related_registration_id_event_registrations_id_fk FOREIGN KEY (related_registration_id) REFERENCES public.event_registrations(id) ON DELETE SET NULL;

--
-- PostgreSQL database dump complete
--

-- ─── Supabase güvenliği ─────────────────────────────────────────────────────────────────────────────
-- Supabase, yeni tablolara herkese açık Data API rollerinin (anon/authenticated) erişimini varsayılan olarak
-- açar. CMS bu rolleri kullanmaz (doğrudan DATABASE_URL ile bağlanır); hepsini kapatıyoruz.
-- Supabase dışı Postgres'te bu roller yoktur ve blok hiçbir şey yapmaz.
REVOKE ALL ON SCHEMA obs FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON SCHEMA obs FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA obs FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA obs FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
