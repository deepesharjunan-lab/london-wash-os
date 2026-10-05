import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteSettings } from "@/lib/site/settings";
import { oauthConfigured } from "@/lib/google/oauth";
import { dailyMetrics, getConnection, getHours, GoogleApiError, listPosts, searchKeywords, type DailyMetric, type TimeOfDay } from "@/lib/google/gbp";
import { DAYS } from "@/lib/google/days";
import { ago, fmtDay } from "@/lib/time";
import { deletePostAction, deleteReplyAction, disconnectAction, findLocationAction, markHandledAction, syncNowAction } from "./actions";
import { PostForm, RegularHoursForm, ReplyBox, SpecialHoursForm } from "./ui";

// WEBSITE → Google Business: the shop's Google Business Profile inside the
// console. Reviews (reply, unreplied badge, new-review alerts), performance,
// posts, and opening / special hours. See lib/google.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type SP = { tab?: string; f?: string; error?: string; connected?: string };

const TABS = [
  ["reviews", "Reviews"],
  ["performance", "Performance"],
  ["posts", "Posts"],
  ["hours", "Hours"],
] as const;

const card = "border-2 border-black/10 bg-white p-5";
const btn = "rounded-md border border-black/10 bg-white px-3 py-1.5 text-[13px] font-medium text-ink hover:border-navy/40";

function Stars({ n }: { n: number | null }) {
  if (!n) return null;
  return (
    <span className="text-[15px] tracking-tight text-[#e3a008]" aria-label={`${n} stars`}>
      {"★".repeat(n)}
      <span className="text-black/15">{"★".repeat(5 - n)}</span>
    </span>
  );
}

function GoogleProblem({ e }: { e: unknown }) {
  const waiting = e instanceof GoogleApiError && e.waiting;
  const text = e instanceof Error ? e.message : "Google didn't answer. Try again in a minute.";
  return (
    <div className={"rounded-md px-4 py-3 text-[13.5px] " + (waiting ? "bg-[#fbf3e2] text-[#8a5a12]" : "bg-[#f8e7e4] text-[#9c3326]")}>
      {waiting ? <b>Waiting for Google's approval. </b> : null}
      {text}
    </div>
  );
}

export default async function GoogleBusinessPage({ searchParams }: { searchParams: SP }) {
  const configured = oauthConfigured();
  const conn = await getConnection();
  const tab = TABS.some(([k]) => k === searchParams.tab) ? searchParams.tab! : "reviews";

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
        <Link href="/website" className="hover:underline">
          Website
        </Link>
      </div>
      <h1 className="mb-2 font-archivo text-2xl font-extrabold text-ink">Google Business Profile</h1>
      <p className="mb-5 max-w-3xl text-sm text-ink/60">Reply to Google reviews, see how people find the shop, publish posts and keep opening hours right, without leaving the console.</p>

      {searchParams.error && <p className="mb-4 rounded-md bg-[#f8e7e4] px-3 py-2 text-[13px] text-[#9c3326]">{searchParams.error}</p>}
      {searchParams.connected === "1" && <p className="mb-4 rounded-md bg-[#e2eee7] px-3 py-2 text-[13px] text-[#2c6a4e]">Connected. Reviews are loaded and will refresh every 15 minutes.</p>}
      {searchParams.connected === "pending" && (
        <p className="mb-4 rounded-md bg-[#fbf3e2] px-3 py-2 text-[13px] text-[#8a5a12]">Google account connected. The business details will load once Google approves API access.</p>
      )}

      {!configured ? <SetupSteps /> : !conn ? <ConnectCard /> : <Connected conn={conn} tab={tab} sp={searchParams} />}
    </div>
  );
}

function SetupSteps() {
  return (
    <section className={card + " max-w-3xl text-[13.5px] text-ink/75"}>
      <h2 className="mb-2 font-archivo text-lg font-bold text-ink">Finish setup</h2>
      <ol className="list-decimal space-y-1.5 pl-5">
        <li>
          In Vercel → Settings → Environment Variables, add <b>GOOGLE_OAUTH_CLIENT_ID</b> and <b>GOOGLE_OAUTH_CLIENT_SECRET</b> from Google Cloud (project <b>london-wash-os</b> →
          Google Auth Platform → Clients → London Wash OS console), then redeploy.
        </li>
        <li>Google must approve the Business Profile API access request (an email arrives at deepesharjunan@gmail.com).</li>
        <li>After approval, enable “Google My Business API” in the same Cloud project (reviews and posts use it).</li>
        <li>Come back here and press Connect.</li>
      </ol>
    </section>
  );
}

function ConnectCard() {
  return (
    <section className={card + " max-w-2xl"}>
      <h2 className="mb-1 font-archivo text-lg font-bold text-ink">Connect your Business Profile</h2>
      <p className="mb-4 text-[13.5px] text-ink/65">
        Sign in with the Google account that manages <b>The London Wash</b> on Google and allow “London Wash OS” to manage your business listings. Only The London Wash is used, even if the
        account has other businesses.
      </p>
      <a href="/api/google/oauth/start" className="inline-flex items-center gap-2 rounded-md bg-[#1f7a4d] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#19663f]">
        Connect Google Business Profile
      </a>
    </section>
  );
}

async function Connected({ conn, tab, sp }: { conn: NonNullable<Awaited<ReturnType<typeof getConnection>>>; tab: string; sp: SP }) {
  const db = createAdminClient();
  const { count: todo } = await db.from("google_review").select("review_id", { count: "exact", head: true }).is("reply_comment", null).is("handled_at", null);
  const waiting = /approved API access/i.test(conn.last_error ?? "");

  return (
    <>
      <section className={card + " mb-5 flex flex-wrap items-center justify-between gap-4"}>
        <div className="flex items-center gap-3">
          <span className="relative flex h-3.5 w-3.5">
            <span className={"absolute inline-flex h-full w-full rounded-full " + (waiting ? "bg-[#e3a008]" : conn.last_error ? "bg-[#c0392b]" : "bg-[#1f9d55]")} />
          </span>
          <div>
            <div className="text-[15px] font-semibold text-ink">{conn.location_title ?? "Google account connected"}</div>
            <div className="text-[12.5px] text-ink/55">
              {conn.average_rating ? (
                <>
                  <span className="font-semibold text-ink">{Number(conn.average_rating).toFixed(1)} ★</span> · {conn.review_count} reviews ·{" "}
                </>
              ) : null}
              {conn.last_sync_at ? `checked ${ago(conn.last_sync_at)}` : "not checked yet"}
              {waiting ? " · waiting for Google's API approval" : ""}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!conn.location_name && (
            <form action={findLocationAction}>
              <button className={btn}>Find my business</button>
            </form>
          )}
          <form action={syncNowAction}>
            <button className={btn}>Refresh now</button>
          </form>
          <form action={disconnectAction}>
            <button className={btn + " text-[#9c3326]"}>Disconnect</button>
          </form>
        </div>
      </section>
      {conn.last_error && (
        <div className="mb-5">
          <GoogleProblem e={new GoogleApiError(conn.last_error, 0, waiting)} />
        </div>
      )}

      <nav className="mb-5 flex flex-wrap gap-1 border-b border-black/10">
        {TABS.map(([k, l]) => (
          <Link
            key={k}
            href={`/google?tab=${k}`}
            className={"-mb-px border-b-2 px-4 py-2 text-[14px] " + (tab === k ? "border-accent font-semibold text-ink" : "border-transparent text-ink/55 hover:text-ink")}
          >
            {l}
            {k === "reviews" && (todo ?? 0) > 0 && <span className="ml-1.5 rounded-full bg-[#c0392b] px-1.5 py-0.5 text-[11px] font-bold text-white">{todo}</span>}
          </Link>
        ))}
      </nav>

      {tab === "reviews" && <ReviewsTab filter={sp.f} todo={todo ?? 0} />}
      {tab === "performance" && <PerformanceTab />}
      {tab === "posts" && <PostsTab />}
      {tab === "hours" && <HoursTab />}
    </>
  );
}

// ---------- reviews ----------

async function ReviewsTab({ filter, todo }: { filter?: string; todo: number }) {
  const f = filter === "all" || filter === "low" ? filter : "todo";
  const db = createAdminClient();
  let q = db
    .from("google_review")
    .select("review_id, star_rating, comment, reviewer_name, reviewer_photo, create_time, reply_comment, reply_update_time, handled_at")
    .order("create_time", { ascending: false })
    .limit(100);
  if (f === "todo") q = q.is("reply_comment", null).is("handled_at", null);
  if (f === "low") q = q.lte("star_rating", 3);
  const [{ data }, st] = await Promise.all([q, getSiteSettings()]);
  const reviews = (data ?? []) as any[];
  const wa = st.business.whatsapp.replace(/\D/g, "");
  const phone = wa.length === 12 ? `+${wa.slice(0, 2)} ${wa.slice(2, 7)} ${wa.slice(7)}` : `+${wa}`;

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ["todo", `Needs a reply (${todo})`],
          ["low", "3★ and below"],
          ["all", "All reviews"],
        ].map(([k, l]) => (
          <Link key={k} href={`/google?tab=reviews&f=${k}`} className={"rounded-full border px-3 py-1 text-[12.5px] " + (f === k ? "border-accent bg-accent/10 font-semibold text-ink" : "border-black/10 text-ink/60")}>
            {l}
          </Link>
        ))}
      </div>
      {reviews.length === 0 && <p className={card + " text-[13.5px] text-ink/55"}>{f === "todo" ? "All caught up. Every review has a reply." : "No reviews here yet."}</p>}
      <div className="space-y-3">
        {reviews.map((r) => (
          <article key={r.review_id} className={card + " p-4"}>
            <div className="flex items-start gap-3">
              {r.reviewer_photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.reviewer_photo} alt="" className="h-9 w-9 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e9e3d6] text-[14px] font-bold text-ink/60">{(r.reviewer_name ?? "?")[0]}</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="text-[14px] font-semibold text-ink">{r.reviewer_name ?? "A Google user"}</span>
                  <Stars n={r.star_rating} />
                  <span className="text-[12px] text-ink/45">{r.create_time ? fmtDay(r.create_time) : ""}</span>
                </div>
                <p className={"mt-1 whitespace-pre-line text-[13.5px] " + (r.comment ? "text-ink/80" : "italic text-ink/40")}>{r.comment ?? "Rating only, no comment."}</p>

                {r.reply_comment ? (
                  <div className="mt-2 border-l-2 border-[#1f7a4d]/40 bg-[#f4f8f5] px-3 py-2">
                    <div className="mb-0.5 text-[11.5px] font-semibold uppercase tracking-wide text-[#2c6a4e]">
                      Your reply{r.reply_update_time ? ` · ${fmtDay(r.reply_update_time)}` : ""}
                    </div>
                    <p className="whitespace-pre-line text-[13px] text-ink/75">{r.reply_comment}</p>
                    <div className="mt-1 flex items-center gap-3">
                      <ReplyBox reviewId={r.review_id} stars={r.star_rating} name={r.reviewer_name ?? ""} hasComment={!!r.comment} existing={r.reply_comment} phone={phone} />
                      <form action={deleteReplyAction}>
                        <input type="hidden" name="review_id" value={r.review_id} />
                        <button className="text-[12.5px] text-[#9c3326] hover:underline">Delete reply</button>
                      </form>
                    </div>
                  </div>
                ) : (
                  <>
                    <ReplyBox reviewId={r.review_id} stars={r.star_rating} name={r.reviewer_name ?? ""} hasComment={!!r.comment} existing={null} phone={phone} />
                    <form action={markHandledAction} className="mt-1.5">
                      <input type="hidden" name="review_id" value={r.review_id} />
                      <input type="hidden" name="on" value={r.handled_at ? "0" : "1"} />
                      <button className="text-[12px] text-ink/45 hover:text-ink hover:underline">{r.handled_at ? "Move back to “needs a reply”" : "No reply needed"}</button>
                    </form>
                  </>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

// ---------- performance ----------

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

async function PerformanceTab() {
  // Google's numbers arrive a few days late; compare the last 28 complete days with the 28 before.
  const end = addDays(new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z"), -3);
  const start = addDays(end, -55);
  const kwMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
  let data: Record<DailyMetric, Record<string, number>>;
  let keywords: Awaited<ReturnType<typeof searchKeywords>> = [];
  try {
    [data, keywords] = await Promise.all([dailyMetrics(start, end), searchKeywords(kwMonth, kwMonth).catch(() => [])]);
  } catch (e) {
    return <GoogleProblem e={e} />;
  }

  const days = Array.from({ length: 56 }, (_, i) => iso(addDays(start, i)));
  const cur = days.slice(28);
  const prev = days.slice(0, 28);
  const sum = (ms: DailyMetric[], ds: string[]) => ds.reduce((t, d) => t + ms.reduce((a, m) => a + (data[m]?.[d] ?? 0), 0), 0);
  const VIEWS: DailyMetric[] = ["BUSINESS_IMPRESSIONS_MOBILE_SEARCH", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_MAPS", "BUSINESS_IMPRESSIONS_DESKTOP_MAPS"];
  const ACTIONS: DailyMetric[] = ["CALL_CLICKS", "WEBSITE_CLICKS", "BUSINESS_DIRECTION_REQUESTS", "BUSINESS_CONVERSATIONS"];
  const tiles: { label: string; m: DailyMetric[] }[] = [
    { label: "Profile views", m: VIEWS },
    { label: "Calls", m: ["CALL_CLICKS"] },
    { label: "Website clicks", m: ["WEBSITE_CLICKS"] },
    { label: "Direction requests", m: ["BUSINESS_DIRECTION_REQUESTS"] },
    { label: "Chats", m: ["BUSINESS_CONVERSATIONS"] },
  ];
  const daily = cur.map((d) => ({ d, views: sum(VIEWS, [d]), actions: sum(ACTIONS, [d]) }));
  const peak = Math.max(1, ...daily.map((x) => x.views));
  const searchViews = sum(["BUSINESS_IMPRESSIONS_MOBILE_SEARCH", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH"], cur);
  const mapsViews = sum(["BUSINESS_IMPRESSIONS_MOBILE_MAPS", "BUSINESS_IMPRESSIONS_DESKTOP_MAPS"], cur);
  const mobile = sum(["BUSINESS_IMPRESSIONS_MOBILE_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_MAPS"], cur);

  return (
    <div className="space-y-5">
      <p className="text-[12.5px] text-ink/50">
        {fmtDay(cur[0])} – {fmtDay(cur[27])}, compared with the 28 days before. Google's figures arrive about 3 days late.
      </p>
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {tiles.map((t) => {
          const now = sum(t.m, cur);
          const before = sum(t.m, prev);
          const change = before ? Math.round(((now - before) / before) * 100) : null;
          return (
            <div key={t.label} className={card + " p-4"}>
              <div className="text-[12px] font-semibold uppercase tracking-wide text-ink/50">{t.label}</div>
              <div className="mt-1 font-archivo text-2xl font-extrabold text-ink">{now.toLocaleString("en-IN")}</div>
              <div className={"text-[12px] " + (change === null ? "text-ink/40" : change >= 0 ? "text-[#2c6a4e]" : "text-[#9c3326]")}>
                {change === null ? "no earlier data" : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}% vs before`}
              </div>
            </div>
          );
        })}
      </div>

      <section className={card}>
        <h2 className="mb-3 text-[15px] font-bold text-ink">Daily views and actions</h2>
        <div className="flex h-40 items-end gap-[3px]">
          {daily.map((x) => (
            <div key={x.d} className="group relative flex h-full flex-1 flex-col justify-end" title={`${fmtDay(x.d)}: ${x.views} views, ${x.actions} actions`}>
              <div className="w-full rounded-t-sm bg-accent/30" style={{ height: `${(x.views / peak) * 100}%` }} />
              <div className="absolute bottom-0 w-full rounded-t-sm bg-[#1f7a4d]" style={{ height: `${(x.actions / peak) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-ink/55">
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 bg-accent/30" />
            Views
          </span>
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 bg-[#1f7a4d]" />
            Calls, website, directions, chats
          </span>
          <span>
            Search {searchViews.toLocaleString("en-IN")} · Maps {mapsViews.toLocaleString("en-IN")} · on phones {searchViews + mapsViews ? Math.round((mobile / (searchViews + mapsViews)) * 100) : 0}%
          </span>
        </div>
      </section>

      <section className={card + " max-w-2xl"}>
        <h2 className="mb-1 text-[15px] font-bold text-ink">What people searched to find you</h2>
        <p className="mb-3 text-[12.5px] text-ink/50">{kwMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</p>
        {keywords.length === 0 ? (
          <p className="text-[13px] text-ink/50">Google hasn't shared search terms for this month yet.</p>
        ) : (
          <table className="w-full text-[13.5px]">
            <tbody>
              {keywords.map((k) => (
                <tr key={k.keyword} className="border-t border-black/5">
                  <td className="py-1.5 text-ink/80">{k.keyword}</td>
                  <td className="py-1.5 text-right font-semibold text-ink">{k.count !== null ? k.count.toLocaleString("en-IN") : `under ${k.under}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// ---------- posts ----------

async function PostsTab() {
  let posts: Awaited<ReturnType<typeof listPosts>> = [];
  let problem: unknown = null;
  try {
    posts = await listPosts();
  } catch (e) {
    problem = e;
  }
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <div className="space-y-3">
        {problem ? <GoogleProblem e={problem} /> : null}
        {!problem && posts.length === 0 && <p className={card + " text-[13.5px] text-ink/55"}>No posts yet. A weekly post keeps the profile fresh and helps it rank.</p>}
        {posts.map((p) => {
          const img = p.media?.[0]?.googleUrl ?? p.media?.[0]?.sourceUrl;
          return (
            <article key={p.name} className={card + " flex gap-4 p-4"}>
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt="" className="h-24 w-24 shrink-0 object-cover" referrerPolicy="no-referrer" />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-[12px] text-ink/50">
                  <span className="rounded bg-[#f1ece2] px-1.5 py-0.5 font-semibold uppercase tracking-wide text-ink/60">{p.topicType === "OFFER" ? "Offer" : p.topicType === "EVENT" ? "Event" : "Update"}</span>
                  <span className={p.state === "LIVE" ? "text-[#2c6a4e]" : p.state === "REJECTED" ? "text-[#9c3326]" : ""}>{p.state === "LIVE" ? "Live" : p.state === "REJECTED" ? "Rejected by Google" : "Processing"}</span>
                  {p.createTime && <span>· {fmtDay(p.createTime)}</span>}
                </div>
                {p.event?.title && <div className="text-[14px] font-semibold text-ink">{p.event.title}</div>}
                <p className="whitespace-pre-line text-[13.5px] text-ink/80">{p.summary}</p>
                <div className="mt-2 flex items-center gap-3 text-[12.5px]">
                  {p.searchUrl && (
                    <a href={p.searchUrl} target="_blank" rel="noopener" className="text-accent hover:underline">
                      View on Google ↗
                    </a>
                  )}
                  <form action={deletePostAction}>
                    <input type="hidden" name="name" value={p.name} />
                    <button className="text-[#9c3326] hover:underline">Delete</button>
                  </form>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <aside className={card + " self-start"}>
        <h2 className="mb-3 text-[15px] font-bold text-ink">New post</h2>
        <PostForm />
      </aside>
    </div>
  );
}

// ---------- hours ----------

const hhmm = (t?: TimeOfDay, close = false) => {
  const h = t?.hours ?? 0;
  const m = t?.minutes ?? 0;
  if (close && h === 24) return "23:59";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

async function HoursTab() {
  let h;
  try {
    h = await getHours();
  } catch (e) {
    return <GoogleProblem e={e} />;
  }
  const regular: Record<string, { open: string; close: string }[]> = Object.fromEntries(DAYS.map((d) => [d, []]));
  for (const p of h.regularHours?.periods ?? []) regular[p.openDay]?.push({ open: hhmm(p.openTime), close: hhmm(p.closeTime, true) });
  const today = new Date().toISOString().slice(0, 10);
  const special = (h.specialHours?.specialHourPeriods ?? [])
    .map((s) => ({
      date: `${s.startDate.year}-${String(s.startDate.month).padStart(2, "0")}-${String(s.startDate.day).padStart(2, "0")}`,
      closed: !!s.closed,
      open: hhmm(s.openTime),
      close: hhmm(s.closeTime, true),
    }))
    .filter((s) => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className={card}>
        <h2 className="mb-1 text-[15px] font-bold text-ink">Opening hours</h2>
        <p className="mb-3 text-[12.5px] text-ink/50">What Google Search and Maps show every week.</p>
        <RegularHoursForm initial={regular} />
      </section>
      <section className={card}>
        <h2 className="mb-1 text-[15px] font-bold text-ink">Special hours</h2>
        <p className="mb-3 text-[12.5px] text-ink/50">Holidays and one-off changes. Past days drop off automatically.</p>
        <SpecialHoursForm initial={special} />
      </section>
    </div>
  );
}
