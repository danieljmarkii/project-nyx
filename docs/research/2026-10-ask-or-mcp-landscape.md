# Ask or MCP: owners' own AI assistants, pet records, and answers inside the app (the October 2026 landscape)

**Date:** 2026-10-28
**Status:** 🧊 Frozen evidence, re-verify at use. Evidence only; this brief makes no product decision.
**Context:** [CUL-2225](https://linear.app/projectnyx/issue/CUL-2225). After [#1340](https://github.com/danieljmarkii/project-nyx/pull/1340), a vet panel read of Nyx's chicken rechallenge built from a direct database pull, the PM asked whether Culprit should grow Ask to answer questions like that, or let owners connect their own AI assistant to their pet's record through MCP, or both. The decision briefs live on the issue; the isolated lens reads live in `docs/sessions/2026-10-28-ask-or-mcp-convening.md`.

**Evidence tags.**
- `[E]` verified against a source a research lane fetched on 2026-10-28 (a vendor page means *the vendor says so*, not that the feature was tested).
- `[R]` a repo or Linear fact, with the file or issue named.
- `[A]` a reasoned assumption, an inference, or a search snippet whose page could not be fetched.
- `†` the source is older than six months (before 2026-04-28) and may be stale.

---

## 0. Method and limits

Three isolated lanes ran on 2026-10-28: (1) the MCP protocol and the AI platforms, about 240 tool calls; (2) consumer health data inside general assistants plus the pet and veterinary side, about 210 tool calls; (3) the factual record of the #1340 session, all 563 of its events. Every lane was read only: nothing was posted, submitted or signed up for. Limits: most OpenAI help-centre and pricing pages, and the AVMA site, refused automated fetches, so those points rest on press coverage or search snippets and are tagged accordingly. Neither lane could log in to the ChatGPT or Claude connector directories; directory contents come from public registries and third-party snapshots. No connector was installed and no app was tested.

---

## 1. Executive summary (facts, not recommendations)

1. **No pet or veterinary company exposes an individual pet's record to ChatGPT, Claude or Gemini.** The only pet apps found in ChatGPT are insurance quoting (MetLife Pet, ManyPets); a July snapshot counted zero pet brands among about 380 ChatGPT apps; the four public MCP registries hold no official owner-facing pet record. `[E]`
2. **Claude is the only major assistant where an ordinary consumer can add a third-party connector on a phone, on every plan including Free, and listing in its directory is self-serve.** ChatGPT has the largest audience but a reviewed plugin store that forbids upselling, web-only custom servers on some paid plans, and reported low partner traffic. Gemini allows custom MCP only for US adults on the web; consumer Copilot and Apple (iOS 27) have none. `[E]`
3. **The closest health precedents built connectors as paid, mostly read-only add-ons beside an in-app assistant:** Strava (subscribers, Claude only), Withings (paid tier, 16 read and 4 confirmed-write tools), Function Health (launched with counts only, never individual lab values). No company has published connector usage numbers. `[E]`
4. **General assistants now hold personal health data at scale.** ChatGPT Health opened to all US adults on every plan on 2026-07-23; OpenAI says more than 300M people ask health questions weekly, and 70% of pilot health queries happened outside the Health space. `[E]`
5. **Owners already use general AI for pet health:** 43% of US owners, about seven times a week, 54% about symptoms, 59% changed care because of it; 71% still trust vets most, and 64% follow the vet when the two conflict (a sponsored survey). `[E]`
6. **General models err in both triage directions on animals, and they defer to the caregiver.** Over-triage of canine emergencies, under-triage of feline fractures, the "cat not eating → feeding tips" failure, and a preprint showing a caregiver's stated, clinically inferior preference pulls frontier models toward inappropriate care, worsening over turns. `[E]`
7. **No study tests LLM reasoning over longitudinal pet logs.** A human analog: asked repeatedly to grade ten years of one person's Apple Watch data, ChatGPT's grade swung from F to B. `[E]`
8. **The leading documented MCP risk is injection through data a server returns,** including from vetted servers that surface user-controlled content. `[E]`
9. **On Supabase, a connector's token is an ordinary user token;** scopes do not limit database access; read-only must be enforced by RLS on the `client_id` claim or by never letting the token reach the database. The newest MCP spec deprecates the client registration method Supabase's OAuth server supports. `[E]`
10. **Under a connector, the owner's AI plan pays for inference; under Ask, Culprit pays.** A purpose-built in-app deep read is estimated at $0.28 to $0.70 per read depending on the model. `[E]` prices, `[A]` the estimate.

---

## 2. The #1340 workflow, as recorded `[R]`

Source: the session's 563 transcript events (session_01RLToCcFBp1yhWqdFQHyFtr), [#1340](https://github.com/danieljmarkii/project-nyx/pull/1340), and `docs/pet-research/nyx/2026-10-28-chicken-rechallenge-vet-panel.md`.

- **Ask:** the PM, verbatim in part: "the culprit app never makes a recommendation per se. Like never recommend continuing / discontinuing a diet trial. But.. what I want you to do is convene the vet panel and discuss Nyx's backend data."
- **Data:** a Claude Code cloud session queried the production database through the Supabase MCP server with hand-written SQL: 26 queries over 15 tables, two failing on guessed column names; the first two used the wrong timezone. A repository hook paused a read-only query as a possible production write; the PM approved it in six seconds.
- **Statistics:** SQL for period and weekly rates (vomits under 90 minutes apart merged into one episode), then a Python script over 51 hand-pasted episode timestamps for sliding 8.9-day windows, Poisson odds and power.
- **Panel:** one ~1,240-word computed evidence pack, four isolated subagent lenses (GI internist, nutritionist, criticalist, skeptical GP), each given the house's two safety invariants and an output contract requiring a falsification attempt; the main thread synthesized the reads in 35 seconds.
- **Cost and time:** the first answer took 6 min 55 s and $5.25 at list price; $10.42 in total; about three hours wall clock and 15 minutes of active model time.
- **The first live answer opened:** "**Bottom line:** The panel agreed with you. Three episodes in nine days don't separate chicken from Nyx's own background vomiting, so the data doesn't support calling chicken the culprit." The lens reads said "neither convicts nor clears chicken"; the committed document says the owner's prior is "supported as *not ruled out*, not as *shown*."
- **The finding all four lenses ranked first** was a possible 15% weight loss (4.40 kg on 06-15, 3.73 kg on 09-16, the first entered retroactively and unconfirmed). The app's weight lane, built and dark, names this case ([CUL-1135](https://linear.app/projectnyx/issue/CUL-1135)) and waits on seven rulings ([CUL-1390](https://linear.app/projectnyx/issue/CUL-1390)). ⚠ §V1
- **Gaps it recorded:** a false "three days in a row" read ([CUL-2223](https://linear.app/projectnyx/issue/CUL-2223)); a rechallenge invisible to the trial record and the vet report; every portion "unknown" and intake mostly blank; no stool, drinking, urination or regurgitation capture.

---

## 3. MCP, the protocol, in October 2026

- **Spec 2026-07-28** (release candidate 2026-05-21): stateless; sessions and the `initialize` handshake removed; a `server/discover` call; servers return `input_required` instead of sending elicitation or sampling requests; Tasks became a polled extension; Roots, Sampling and Logging deprecated with at least 12 months' notice. [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog), [blog](https://blog.modelcontextprotocol.io/posts/2026-07-28/) `[E]`
- **Authorization:** a server is an OAuth 2.1 resource server; it MUST publish Protected Resource Metadata (RFC 9728), MUST check that each token was issued for it, and MUST NOT accept or pass along other tokens. Client ID Metadata Documents (CIMD) are a SHOULD; Dynamic Client Registration is a deprecated MAY. The roadmap adds DPoP and agent identity. [authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), [roadmap](https://blog.modelcontextprotocol.io/posts/mcp-roadmap/) (2026-08-22) `[E]`
- **MCP Apps**, the first official extension (2026-01-26†): a server's interactive UI rendered in a sandboxed frame inside Claude (web, desktop), ChatGPT, Goose and VS Code Insiders. [blog](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/) `[E]`
- **Registry:** a preview with no security scanning; through its [public API](https://registry.modelcontextprotocol.io/v0.1/servers) on 2026-10-28, 51,461 latest-version entries, about 34,000 remote (spam and duplicates included). `[E]`
- **Governance and scale:** the Linux Foundation's Agentic AI Foundation since 2025-12-09†, with AWS, Anthropic, Block, Bloomberg, Cloudflare, Google, Microsoft and OpenAI as platinum members, 305 members on 2026-10-22 ([AAIF](https://aaif.io/news/agentic-ai-foundation-surpasses-300-members)); "close to half-a-billion downloads a month" across the main SDKs (2026-07-28). `[E]`

---

## 4. Where an owner could use a connector today

| Surface | Who can add a third-party connector | On a phone? | Directory and review | Reach (US AI users, Menlo 2026-09-16) |
|---|---|---|---|---|
| **Claude** | Directory connectors on every plan including Free; a custom connector by URL on Free (one), Pro, Max, Team, Enterprise | Directory connectors install from the iOS and Android apps (beta); custom URLs are added on web or desktop, then work on the phone | Self-serve submission from a paid account, an automated scan, listed as "Community" by default, Anthropic may escalate to "Verified"; requires OAuth, a read-only or destructive hint on every tool, a privacy policy, a populated test account; the form asks whether the connector "handles personal health data"; every listing eligible for in-chat "Suggested Connectors" | ~20% |
| **ChatGPT** | Listed "plugins" (formerly apps) for consumers; custom servers on the web only, on some paid plans (Plus "still rolling out") | Listed plugins yes; custom servers no | OpenAI review and a verified identity; a plugin "must not display subscription plans… or promote upgrades"; protected health information restricted; launched without the EEA, Switzerland and UK† | ~60% |
| **Gemini** | Custom MCP servers for US adults 18+, personal accounts, English, activity history on | Added on the web, then usable on mobile | No public directory; named partners sit inside "Spark", which may require the top paid plan `[A]` | ~58% |
| **Copilot (consumer)** | None (MCP only in enterprise Microsoft 365 Copilot) | — | — | — |
| **Apple** | No consumer MCP in iOS 27 (shipped 2026-09-14); Siri reaches apps through App Intents schemas; the Foundation Models framework can call Claude and Gemini | — | — | — |
| **Android** | AppFunctions in private preview | — | — | — |

Sources: Claude [connectors for everyday life](https://claude.com/blog/connectors-for-everyday-life) (2026-04-23), [directory help](https://support.claude.com/en/articles/11724452-use-the-connectors-directory-to-extend-claude-s-capabilities), [custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-MCP), [submission](https://claude.com/docs/connectors/building/submission), [review criteria](https://claude.com/docs/connectors/building/review-criteria), [directory policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy); OpenAI [plugin docs](https://developers.openai.com/plugins/llms-full.txt), [submission guidelines](https://developers.openai.com/apps-sdk/app-submission-guidelines), [apps launch](https://openai.com/index/introducing-apps-in-chatgpt/) (2025-10-06†), [developer forum](https://community.openai.com/t/missing-add-custom-mcp-for-users/1407745) (2026-10-19); [Gemini help](https://support.google.com/gemini/answer/17209137), [9to5Google](https://9to5google.com/2026/06/30/gemini-spark-apps-more/) (2026-06-30); [Microsoft](https://support.microsoft.com/en-us/microsoft-copilot/connecting-microsoft-copilot-to-other-services); [MacRumors iOS 27](https://www.macrumors.com/roundup/ios-27/), [WWDC26 State of the Union](https://developer.apple.com/videos/play/wwdc2026/102/), [MacRumors](https://www.macrumors.com/2026/06/15/three-unannounced-ios-27-features-are-still-coming/) (2026-06-15); [Android AppFunctions](https://developer.android.com/ai/appfunctions); [Menlo, State of Consumer AI](https://menlovc.com/perspective/2026-the-state-of-consumer-ai/) (2026-09-16). All `[E]` except where tagged.

- **ChatGPT scale:** about 900M weekly users ([TechCrunch](https://techcrunch.com/2026/02/27/chatgpt-reaches-900m-weekly-active-users), 2026-02-27†); OpenAI says its models reach "more than one billion active users" (AFP, 2026-07-31). Bloomberg reported that partners got little traffic from the roughly 300 integrations ([PYMNTS](https://www.pymnts.com/artificial-intelligence-2/2026/openai-aims-to-improve-developer-experience-around-third-party-chatgpt-apps/), 2026-03-30†). `[E]`
- **Gemini scale:** 950M monthly users at the 2026-07-22 earnings call. `[E]`
- **A 2025 iOS 26.1 beta carried MCP strings** ([9to5Mac](https://9to5mac.com/2025/09/22/macos-tahoe-26-1-beta-1-mcp-integration/)†); no shipped feature was found. `[E]`

---

## 5. Health and fitness: in-app assistants, connectors, and both

**General assistants with personal health data**
- **ChatGPT Health:** launched by waitlist 2026-01-07† outside the EEA, UK and Switzerland; all US adults on web and iOS from 2026-07-23 ([TechCrunch](https://techcrunch.com/2026/07/23/openai-makes-chatgpt-health-available-to-all-u-s-users/); [Thurrott](https://www.thurrott.com/a-i/339642/health-in-chatgpt-is-rolling-out-to-all-us-users), 2026-07-24). Medical records through b.well (US); apps Apple Health, Function, MyFitnessPal, WW, Peloton, AllTrails, Instacart. A separate encrypted space, no training or ad use, synced data deleted within 30 days of disconnecting ([Paubox](https://www.paubox.com/blog/chatgpt-health-launches-nationwide-but-medical-records-not-hipaa-protected), 2026-07-29). More than 300M weekly health askers, up from 230M; 70% of pilot health queries outside the Health space; connected data usable in any chat. Criticism: records lose HIPAA protection once moved; a July lawsuit alleges advice not to see a doctor. `[E]`
- **Claude:** Apple Health, Android Health Connect, HealthEx and Function connections, January 2026†, US Pro and Max, beta, opt-in, revocable, no training ([Anthropic](https://www.anthropic.com/news/healthcare-life-sciences)†). `[E]`
- **Google:** the Fitbit coach became Google Health on 2026-05-19, $9.99/month Premium, with medical records via b.well ([Beebom](https://gadgets.beebom.com/news/google-health-app-officially-replaces-fitbit-app-with-gemini-ai-coaching-medical-records-support)). `[E]`
- **Microsoft Copilot Health:** a waitlisted US preview since 2026-03-12†, HealthEx records, more than 50 wearables including Apple Health, Fitbit and Oura ([Axios](https://www.axios.com/2026/03/12/microsoft-copilot-health)†). `[E]`
- **Apple** scaled back its own AI health coach ([Bloomberg](https://bloomberg.com/news/articles/2026-02-05/apple-is-scaling-back-plans-for-new-ai-based-health-coach-service), 2026-02-05†). `[E]`

**Connector precedents** (none has published usage)
- **Strava** (live since 2026-06-01): official MCP server, read-only, subscribers only, Claude only, rate-capped per minute and per day, an "AI Assistants" entry in its own mobile app's Settings; keeps its in-app Athlete Intelligence ([Strava](https://support.strava.com/en-us/articles/15401531-what-is-the-strava-mcp-connector), 2026-09-24). `[E]`
- **Withings** (October 2026): in its paid Withings+ tier; 16 read tools and 4 write tools that ask for confirmation; directory listings "under review", so users add it by hand; says it does not see users' conversations ([Withings](https://static.withings.com/content/v2/app/mcp/en/index.html)). `[E]`
- **Function Health:** at launch sent only counts and "never" individual lab values ([connector docs](https://services.functionhealth.com/auth0/acul/claude_connector_docs.html)); widened to 160+ labs and added ChatGPT, Claude and Perplexity connectors while keeping its in-app chat ([HIT Consultant](https://hitconsultant.net/2026/08/18/function-launches-secure-health-data-connector-chatgpt-claude-perplexity/), 2026-08-18). `[E]`
- **No official server** from Oura, Whoop, Cronometer or MyFitnessPal; a trojanized clone of a community Oura server spread malware through an MCP marketplace ([The Hacker News](https://thehackernews.com/2026/02/smartloader-attack-uses-trojanized-oura.html), February 2026†). **No free health connector from a major brand was found.** `[E]`

**In-app assistants:** Oura Advisor (60% of beta users engaged weekly, 20% daily, company figures†); Whoop Coach on OpenAI with "zero retention" (2023†). `[E]`

---

## 6. Pets and vets

**Owner surveys** (all sponsored unless noted; no 2025–26 survey from AVMA, Pew, Rover, Chewy, Petco, Banfield, Trupanion, Zoetis or Mars was found)
- **Talker Research for Darwin's** (n=2,000, fielded April 2026, published 2026-08-31): 43% of US owners have used AI for pet health or nutrition, about seven times a week; 54% asked about symptoms; 59% changed their pet's care; 71% trust vets most versus 14% AI; 64% follow the vet when the two conflict ([Talker](https://talkerresearch.com/3-in-5-say-ai-recommendations-changed-how-they-care-for-their-pet/)). `[E]`
- **MetLife Pet** (n=1,000, February 2026†): 23% used AI to assess a pet's mental health; 17% of those used it to decide whether to see a vet. **RSPCA** (UK, n=5,619, 2026-06-29): 10% routinely use AI for pet advice; 1 in 20 for cost reasons; "ticking time bomb" ([Vet Times](https://www.vettimes.com/news/business/digital/time-bomb-warning-issued-over-pet-owners-ai-use)). **zooplus** (16 countries, 2026-07-01): about a third use AI tools. **Academic** (Griot and Ward, [Frontiers](https://www.frontiersin.org/journals/veterinary-science/articles/10.3389/fvets.2026.1939644/full), 2026-10-02, n=201, not sponsored): 68% preferred GPT-4o's answers to a vet's; 94% would not trust AI to diagnose without a vet. A vendor survey: 70.6% would only use a pet health app built with licensed vets. `[E]`
- **General context:** 49% of US adults use chatbots; 20% use them for medical advice ([Pew](https://www.pewresearch.org/internet/2026/06/17/americans-and-ai-2026-chatbots-smart-devices-and-views-on-impact/), 2026-06-17). 25% of US adults use AI for health questions, up from 14% (Menlo). `[E]`

**Pet products with AI**
- In-app assistants grounded in the pet's own data, marketed against general chatbots: **Fi Intelligence** (collar data plus uploaded vet records; dogs, US, one pet per chat; March 2026†), **Petcube** ($99.99/year; profile and history plus 24/7 vet chat; March 2026†), **Tractive** (weekly AI summaries, predictive alerts; April 2026†; it bought Whistle, whose devices shut down 2025-08-31†), **Maven Pet Companion** ($167.92/year; general AI has "never met the dog", 2026-10-13). `[E]`
- **Chewy:** AI for customer service and clinic scheduling; no owner health chatbot found ([Global Pet Industry](https://globalpetindustry.com/news/chewy-adds-208000-customers-doubles-down-on-ai-investment/), 2026-09-11). **PetMD's** symptom checker is a vet-built decision tree. Triage tools with vendor accuracy claims: Joii/Vet-AI (81% versus 75% Gemini and 56% ChatGPT†), Petriage ("97%+"), TTcare (photo analysis, 95%). `[E]` vendor claims.
- **In ChatGPT:** insurance quoting only, MetLife Pet ([2026-10-14](https://www.metlifepetinsurance.com/chat-gpt-press-release/)) and ManyPets (September 2026); zero pet brands among about 380 ChatGPT apps in July ([Tru Commerce](https://trucommerce.ai/insights/chatgpt-apps-for-pet-brands)). **In MCP registries** (searched 2026-10-28): content sites, directories, FDA animal adverse-event data, Sage Veterinary Imaging, a Moscow clinic chain, unofficial practice-software wrappers, one community pet-logging project; no official owner-facing pet record. `[E]`

**The veterinary side**
- Vets' own AI use rose to 83.7% from 39.2% in 2024; their top concern is reliability (67.4%) (Digitail/AAHA, n=1,730, [dvm360](https://www.dvm360.com/view/artificial-intelligence-use-among-veterinary-professionals-more-than-doubles-in-2-years), 2026-10-06). `[E]`
- The association of state veterinary boards (AAVSB) says chatbots "must not provide a diagnosis or treatment plan" and that boards' ability to stop owner reliance on online advice "is significantly limited" (white paper, March 2025†). `[E]`
- Vet-side AI is consolidating into practice software (Instinct bought ScribbleVet 2026-01-16†; IDEXX bought CoVet 2026-09-16). **Provet** shipped the only official practice-software MCP server found: read-only reporting data for clinic staff in Claude, ChatGPT, Gemini or Copilot ([Provet](https://www.provet.com/blog/provet-mcp-practice-data-ai-tools), 2026-08-21). At least one other vendor has MCP on its roadmap ([viggoVet](https://viggo.vet/engineering/building-for-agents/), 2026-09-01). No practice system was found that ingests owner-logged symptoms. `[E]`

---

## 7. What general models get wrong (clinical evidence)

- **Triage, both directions:** ChatGPT over-triaged about 60% of non-urgent canine emergency cases while flagging 80–90% of critical dogs ([Vet Record](https://bvajournals.onlinelibrary.wiley.com/doi/abs/10.1002/vetr.6126), December 2025†). On 73 feline fractures, all five models leaned toward under-triage; two caught none of the surgical cases; the best model scored 84.9% ([JAVMA, PMID 42600647](https://pubmed.ncbi.nlm.nih.gov/42600647/), 2026-08-14). The best model scored anesthetic risk correctly 53.3% of the time ([Vet Record](https://bvajournals.onlinelibrary.wiley.com/doi/10.1002/vetr.70741), May 2026). Human analog: ChatGPT Health under-triaged 51.6% of emergencies (Nature Medicine via [NBC](https://www.nbcnews.com/health/health-news/chatgpt-health-under-triaged-half-medical-emergencies-rcna261409), March 2026†). `[E]`
- **The intake failure:** asked about a cat not eating, ChatGPT offered home feeding tips before ruling out illness; for vomiting it advised a bland diet before finding a cause ([Vetster](https://vetster.com/en/wellness/can-chat-gpt-be-trusted-for-pet-health), 2026-06-18; Vetster sells vet visits). `[E]`
- **Deference to the caregiver:** in veterinary, pediatric and elder-care cases, a caregiver's stated, clinically inferior preference shifted frontier models from appropriate to inappropriate care, and errors accumulated across turns, including on cases first answered correctly ([arXiv 2610.14360](http://arxiv.org/abs/2610.14360), 2026-10-09, not peer reviewed). `[E]`
- **Longitudinal data:** asked repeatedly to grade ten years of one person's Apple Watch data, ChatGPT's grade swung between F and B and Claude gave a C; a cardiologist called the analysis "baseless" ([MacRumors on a Washington Post test](https://www.macrumors.com/2026/01/27/chatgpt-apple-health-integration-flaws/), 2026-01-27†). A code-executing agent scored 84% on objective numerical health questions ([Google PHIA](https://arxiv.org/abs/2406.06464), 2025†). No study of LLM reasoning over longitudinal pet logs was found. `[E]`
- **Other benchmarks:** nine LLMs scored 64.8–90.8% on 250 veterinary multiple-choice questions, weakest on treatment, prognosis and prevention ([Frontiers](https://www.frontiersin.org/journals/veterinary-science/articles/10.3389/fvets.2025.1616566/full), 2025†); GPT-4o extracted clinical signs from 250 feline records at 96.9% sensitivity and 97.6% specificity (2025†); PetQA tested 18 models on more than 10,000 owner questions (Korean) and found they need adaptation ([arXiv](http://arxiv.org/abs/2609.04598), September 2026). `[E]`
- **Already in the repo:** all four chatbots under-scored cat pain from face photos (Sci Rep, 2025-12-09†; Claude within an acceptable margin); 52% of ChatGPT's pet-health answers tested incorrect (`docs/research/2026-07-ask-ai-ux-landscape.md`†). `[R]`

---

## 8. Security evidence

- **Injection through returned data:** "A vetted, legitimately operated MCP server that surfaces user-controlled content is itself an injection pathway"; a proof of concept against a well-known developer tool's MCP server succeeded 85% of the time ([Cloud Security Alliance](https://labs.cloudsecurityalliance.org/research/csa-research-note-agentjacking-mcp-sentry-injection-20260612/), 2026-06-12). `[E]`
- **Incidents:** tool poisoning ([Invariant](https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks), 2025-04-01†); a GitHub MCP private-repo leak triggered by a public issue ([Invariant](https://invariantlabs.ai/blog/mcp-github-vulnerability), 2025-05-26†); **Supabase MCP plus Cursor**, where an injected support ticket led an agent holding the service role to exfiltrate data ([General Analysis](https://generalanalysis.com/blog/supabase-mcp-blog), 2025-07-08†; its 2026-10-21 follow-up notes read-only mode still allows every read the role allows and injection filters are only a supplement); a cross-tenant leak at Asana (June 2025†, [AuthZed timeline](https://authzed.com/blog/timeline-mcp-breaches)); ChatGPT connectors combined with memory ([Radware](https://www.radware.com/blog/posts/zombieagent/), January 2026†). `[E]`
- **Framing:** the "lethal trifecta" (private data, untrusted content, a way to send data out); on detection rates, "95% is very much a failing grade" ([Willison](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/), 2025-06-16†); narrow MCP tools for sensitive applications ([Willison](https://simonwillison.net/2026/Jul/31/stateless-mcp/), 2026-07-31). `[E]`
- **Guidance:** the [OWASP MCP Top 10](https://owasp.org/projects/mcp-top-10) (beta: scope creep, prompt injection, over-sharing), the [OWASP Agentic Top 10](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026) (2025-12-09†), [CoSAI's threat taxonomy](https://www.oasis-open.org/2026/01/27/coalition-for-secure-ai-releases-extensive-taxonomy-for-model-context-protocol-security) (2026-01-27†). The spec: servers MUST validate inputs, rate-limit, sanitize outputs ([tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)); annotations are hints, not contracts ([blog](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/)†). `[E]`
- **Supabase:** the OAuth 2.1 server (beta, free during beta) issues standard Supabase JWTs carrying `user_id`, `role` and `client_id` (`aud: authenticated`); "scopes control OIDC data, not database access"; RLS can tell connector traffic apart by `client_id`; custom access-token hooks can set the audience or client-specific claims; it supports Dynamic Client Registration and its docs do not mention CIMD ([OAuth server](https://supabase.com/docs/guides/auth/oauth-server), [MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication), [token security](https://supabase.com/docs/guides/auth/oauth-server/token-security)). Supabase's own pattern: run every tool call as the signed-in user so RLS applies, never the service role ([Supabase](https://supabase.com/blog/give-your-supabase-app-its-own-mcp-server), 2026-10-22). `[E]`
- **Culprit:** an open live-harm defect class lets a client point its own child row at another account's event ([CUL-2214](https://linear.app/projectnyx/issue/CUL-2214)). `[R]`

---

## 9. Economics

- **Model list prices** per million tokens, input / output ([Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing), read 2026-10-28): Opus 5.5 $4 / $20; Sonnet 5.5 $2 / $10; Haiku 5.5 $0.10 / $0.50 (higher above 100K-token prompts); cache reads 0.05x on the 5.5 Opus and Sonnet models; batch 50% off. Ask runs Sonnet 4.6 ($3 / $15) today (`supabase/functions/ask/answer.ts`). `[E]` `[R]`
- **A purpose-built in-app deep read** (server-computed evidence pack; four lenses at ~15K in and ~3.5K out including thinking; a chair at ~20K in and ~5K out): about $0.55 to $0.70 on Opus 5.5, $0.28 to $0.35 on Sonnet 5.5. At the $4.99/month placeholder (about $4.24 net after Apple's small-business commission), three Opus reads a month use roughly 40–50% of net revenue; three Sonnet reads, 20–25%. `[A]`
- **Connector hosting:** Supabase Edge Functions $2 per million calls beyond the 2M included on Pro, 2 s CPU and 256 MB per call ([pricing](https://supabase.com/docs/guides/functions/pricing), [limits](https://supabase.com/docs/guides/functions/limits)); connected users count as monthly active users. Cloudflare Workers $5/month for 10M requests, then $0.30 per million. `[E]`
- **Owner-paid inference inside a partner app:** OpenAI's "Sign in with ChatGPT" (announced 2026-09-29, a limited trial for commercial apps) lets a partner spend a Plus or Pro user's plan ([Stratechery](https://stratechery.com/2026/openai-dev-day-dot-and-openais-product-transition-sign-in-with-chatgpt/), 2026-09-30). Anthropic restricted third-party apps from drawing on Claude subscriptions in early 2026† (secondary sources). `[E]` / `[A]`
- **Apple Private Cloud Compute:** "no cloud API cost" for Small Business Program apps under 2M first-time downloads ([WWDC26](https://developer.apple.com/wwdc26/guides/ios/)); a 32K-token context and per-user quotas are reported, unconfirmed. `[E]` / `[A]`
- **What health connectors cost owners:** Strava, Withings and Function all require a paid tier. 55% of AI users pay for at least one AI product, typically $20–49 a month (Menlo). `[E]`

---

## 10. Apple App Store and regulation

- **Guideline 5.1.2(i)** (added 2025-11-13†, untouched by the 2026-06-08 and 2026-10-16 revisions): "You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so" ([guidelines](https://developer.apple.com/app-store/review/guidelines/)). A developer reports a Claude-API app rejected eight times: "We were not presented with the consent prompt on launch or anywhere else in the app" ([forum](https://developer.apple.com/forums/thread/820209), March 2026†). No guideline forbids directing users to set up a connector in another company's AI app; Strava and Withings do it, with no reported rejection; the app must work on its own (4.2.3(i)). Whether App Review treats an OAuth consent screen on Culprit's own page as the explicit permission is untested. `[E]` / `[A]`
- **HIPAA** covers people only ([45 CFR 160.103](https://www.law.cornell.edu/cfr/text/45/160.103)). The **FTC Health Breach Notification Rule** covers information about "an individual" ([16 CFR 318.2](https://www.law.cornell.edu/cfr/text/16/318.2)); the FTC withdrew its 2021 health-app policy statement on 2026-09-09 while the 2024 rule stands ([AHA](https://www.aha.org/news/headline/2026-09-10-ftc-rescinds-policy-statement-extending-breach-notification-rule-apps-devices-collect-health)); Section 5 remains. **Washington's My Health My Data Act** defines a consumer as a natural person ([RCW 19.373.010](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.010)). A pet's record is likely outside these, an owner's own health notes possibly inside `[A]`. `[E]`
- **Veterinary practice:** AVMA separates general "teleadvice" (no vet-client-patient relationship needed) from patient-specific "telemedicine" (needs one) ([AVMA](https://atwork.avma.org/sites/default/files/2021-02/Telehealth-definitions-AVMA.pdf)†). AAVSB says boards "may opt to consider" whether rules against aiding unlicensed practice reach AI developers†. **California AB 489** (in force 2026-01-01) bars AI wording implying advice from a licensed professional in Division 2, which includes veterinary medicine ([text](https://legiscan.com/CA/text/AB489/2025)). FDA does no premarket review of animal devices ([FDA](https://www.fda.gov/animal-veterinary/animal-health-literacy/how-fda-regulates-animal-devices)). `[E]`

---

## 11. Strategy commentary and demand evidence

- **Ben Thompson:** agents are "the ultimate aggregators"; apps become "mere suppliers… scrapping for crumbs"; most people will have one agent ([Stratechery](https://stratechery.com/2026/apps-agents-and-aggregation/), 2026-09-28). Earlier: "the Windows of AI" (2025-10-07†); a16z, "creating for agents, not humans" (2025-12†); Lenny's Newsletter on ChatGPT apps as "the next big distribution channel" (2026-01-20†), which the Bloomberg traffic report undercuts. `[E]`
- **Menlo Ventures** (5,067 US adults, 2026-09-16): 96% of AI users use a general assistant, 3.0 on average, and 75% also use specialized tools; "a specialized product can be objectively better at a job and still lose to a familiar assistant"; 27% of general-assistant-only users cite privacy concerns about niche tools. `[E]`
- **Already in the repo** (`docs/culprit-competitive-landscape-2026-10.md`): no general assistant had added a pet or veterinary health scope; a general assistant plus the camera roll gives an engaged owner an estimated 55–60% of Culprit's value over a 1–3 week acute episode and about a quarter over an 8-week trial; Wonderdog shipped a Claude-powered chat over clinic records on 2026-08-27 at $9.99/month; Ask had had nine human messages, all from internal accounts. `[R]`

---

## 12. Open uncertainties

- ChatGPT's exact plan and region availability for plugins and custom servers (OpenAI's help and pricing pages refused fetching); the plugin rename date rests on secondary sources.
- Whether Gemini custom servers need a paid plan; whether Claude's mobile install covers custom-URL connectors.
- Whether Apple ships MCP or Siri chatbot extensions in an iOS 27.x update; whether App Review requires in-app consent for a connector authorized inside another company's app.
- Whether either assistant's Health space would accept animal data; whether veterinary data counts as "healthcare" under Anthropic's directory policy or as restricted data under OpenAI's.
- No connector usage or outcome data anywhere; no neutral US survey of owners' AI use (the 43% is a sponsored panel); no study of LLM reasoning over a months-long rechallenge.
- No Supabase timeline for Client ID Metadata Documents; Private Cloud Compute limits unconfirmed; the registry count includes spam and duplicates.

---

## V. Verification pass (2026-10-28)

Corrections found after this brief was written. Each corrected claim keeps its wording above and carries an inline ⚠ pointing here.

- **V1. "Built and dark … waits on seven rulings" (§2) is wrong for Nyx.** Migration 102 (applied 2026-10-11, `docs/sessions/2026-10-11-engines-v3-pm-seed.md`) put the PM's account on `engines_v3_en8`, waiving the PMD-9 gate for that one account. A read only production query on 2026-10-28 found Nyx's stored Signal (generated 01:15 UTC) carrying a `weight_loss` safety finding, third of five. Home has no row for it until PR-37 ([CUL-1414](https://linear.app/projectnyx/issue/CUL-1414)); the vet report's band ([CUL-2026](https://linear.app/projectnyx/issue/CUL-2026)) and Ask relay it. [CUL-1390](https://linear.app/projectnyx/issue/CUL-1390)'s W4 to W7 and [CUL-1544](https://linear.app/projectnyx/issue/CUL-1544)'s four were ruled 2026-10-23; W3 is held for a re-brief. For every other account the lane stays dark until the PMD-9 re-run.
- **V2. The record moved after #1340.** A fourth rechallenge episode was logged at 2026-10-27 19:40 CDT, read as "call today". Everything in §2 describes the record as #1340 pulled it.
