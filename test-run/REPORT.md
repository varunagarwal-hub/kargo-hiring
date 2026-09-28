# Test run: 2026-09-28 09:06 UTC

Model: `gemini-3.1-pro-preview` · Rubric: PM v1, SPM v1 (seeded by the migration) · Lines: PM 60, SPM 60 · Top N: 5

**AI requests:** 15, all `pii_check=passed`. **Independent leak scan:** no name, email, phone, URL or address found in any payload.

## PM ranking

| Rank | Name | Applied | PM | SPM | Line (applied role) | Flag |
|---|---|---|---|---|---|---|
| 1 | Priya Nair | PM | 83.0 | 61.0 | above | clears SPM line |
| 2 | Farah Sheikh | PM | 43.7 | 37.3 | below |  |
| 3 | Karan Mehta | SPM | 33.3 | 24.7 | below |  |

## SPM ranking

| Rank | Name | Applied | PM | SPM | Line (applied role) | Flag |
|---|---|---|---|---|---|---|
| 1 | Priya Nair | PM | 83.0 | 61.0 | above | clears SPM line |
| 2 | Farah Sheikh | PM | 43.7 | 37.3 | below |  |
| 3 | Karan Mehta | SPM | 33.3 | 24.7 | below |  |

---

## Priya Nair: applied PM (`priya-nair-pm.pdf`)

**Personal details separated (never sent to AI):**

name=Priya Nair · email=priya.nair.ops@gmail.com · phone=+91 99301 44821 · linkedin=linkedin.com/in/priya-nair-logistics · github=- · other urls=- · address=-

<details><summary>Redacted CV text (exactly what the AI saw)</summary>

```
[CANDIDATE]
Product Manager | Navi Mumbai
[EMAIL] | [PHONE] | [URL]
SUMMARY
[CANDIDATE] is an operations-turned-product person with 7 years in freight forwarding and customs brokerage.
EXPERIENCE
Senior Operations Executive -> Associate Product Manager, BlueWake Freight Pvt Ltd (2019-2025)
- When a customs hold was placed on a pharma client's export consignment at JNPT at 8pm, coordinated directly with
the CHA and
the Appraising Officer through the night; the hold was cleared at 5am and the shipment made its vessel cut-off before
the client knew.
- Built a quarterly carrier scorecard for the first time at the branch; used it to renegotiate rates with 3 underperforming
shipping lines (average 9% reduction) and to move two lanes to a more reliable carrier.
- Ran the onboarding of a new automotive client over 10 weeks, coordinating with the client's procurement, plant
logistics and
finance teams as their single point of contact until the first 40 containers moved on schedule.
- During the 2023 peak-season volume spike (documentation up 60% for 5 months), redesigned the document checklist
and shift
handovers; no additional headcount was added and the new checklist was adopted permanently by the branch.
- Wrote the PRD for the shipment-tracking dashboard used by 120 clients; worked with engineering to ship it in two
releases.
EDUCATION
MBA (Operations), NMIMS Mumbai, 2019. B.Com, University of Mumbai, 2016.
SKILLS
Customs documentation (ICEGATE), carrier management, SQL, Jira, stakeholder management
```
</details>

### PM: 83.0 / 100

| # | Criterion | Wt | Score | Reason |
|---|---|---|---|---|
| 1 | Got a yes from someone they couldn't instruct | 34 | 3 | "renegotiate rates with 3 underperforming shipping lines" and clearing a hold with the "Appraising Officer" show successful requests to multiple named outside organizations, earning a 3. |
| 2 | Stayed the named contact until closure | 27 | 2 | "coordinating with the client's... teams as their single point of contact" "over 10 weeks" "until the first 40 containers moved on schedule" provides the required duration, role, and closure event. |
| 3 | Caught the disruption before the customer felt it | 24 | 2 | A "customs hold was placed... at 8pm" and resolved so the "shipment made its vessel cut-off before the client knew," clearly showing an unplanned trigger and downstream harm avoided. |
| 4 | Fixed it with what was already in the room | 15 | 3 | Fixed a hold "through the night" (outside planned time) and managed a volume spike where "no additional headcount was added" via process redesign, demonstrating multiple instances of using existing resources. |

**Interview brief (PM):** The candidate's strongest evidence is for fixing it with what was already in the room, as the CV explicitly states they cleared a customs hold 'through the night' and managed a volume spike where 'no additional headcount was added'. The weakest criterion is staying the named contact until closure, because while the CV provides these details for a planned onboarding, the bullet regarding the 5-month volume spike lacks the candidate's specific contact role and the end point of the episode. For the 5-month volume spike, what was your specific contact role with the affected stakeholders, and what was the exact end point that marked the closure of the disruption?

### SPM: 61.0 / 100

| # | Criterion | Wt | Score | Reason |
|---|---|---|---|---|
| 1 | Got a yes from someone they couldn't instruct | 26 | 2 | "Built a quarterly carrier scorecard for the first time... renegotiate rates" and "coordinated directly with the CHA". Meets SPM strong with two distinct outside parties, creating the occasion, and naming avoided cost. |
| 2 | Stayed the named contact until closure | 35 | 1 | "Ran the onboarding... over 10 weeks... until the first 40 containers moved". Meets PM strong but lacks internal coordination and a post-launch closing act, scoring 1 as an SPM weak form. |
| 3 | Caught the disruption before the customer felt it | 21 | 2 | "When a customs hold was placed... the shipment made its vessel cut-off before the client knew." Meets SPM strong by naming an outside origin (customs) and the harm avoided to the client. |
| 4 | Fixed it with what was already in the room | 18 | 3 | Features both a one-off heroic fix ("through the night") and a sustained zero-headcount fix that outlasted the incident ("adopted permanently"), meeting the strong description in different contexts for a 3. |

**Interview brief (SPM):** The candidate's strongest evidence is for fixing it with what was already in the room, as they managed a volume spike without additional headcount by redesigning a checklist that was "adopted permanently by the branch". The weakest area is staying the named contact until closure, as the CV mentions running a 10-week client onboarding but lacks evidence of the candidate handling internal coordination or owning a closing act after the main event. During the automotive client onboarding, how did you personally manage the internal coordination with your own teams, and what specific follow-up actions did you own to closure after those first 40 containers moved?

### Email draft: interview invite

**Subject:** Interview with Kargo - Product Manager

```
Hi Priya,

Thanks for applying for the Product Manager role at Kargo. Your transition from operations to product management at BlueWake Freight really stood out to us. We are building software for freight and customs workflows, and your hands-on experience resolving a late-night customs hold at JNPT shows exactly the kind of deep domain empathy we need. I was also impressed by your initiative in building a carrier scorecard to renegotiate rates and writing the PRD for a shipment-tracking dashboard. We are looking for someone who can bridge the gap between complex logistics operations and intuitive product solutions, and your track record suggests you would be a great fit. I would love to get on a call to discuss your experience and share more about our roadmap. Please reply with two or three 45-minute slots that work for you over the next week, and we will send a calendar invite.

Best,
Founder, Kargo
Mumbai
```

---

## Karan Mehta: applied SPM (`karan-mehta-spm.docx`)

**Personal details separated (never sent to AI):**

name=Karan Mehta · email=karan.mehta@outlook.com · phone=+91-98451-77310 · linkedin=- · github=github.com/karanmehta · other urls=- · address=Koramangala, Bengaluru 560034

<details><summary>Redacted CV text (exactly what the AI saw)</summary>

```
[CANDIDATE]

Senior Product Manager

[EMAIL]  |  [PHONE]  |  [URL]  |  [ADDRESS]

PROFILE

Product leader with 8 years building B2B SaaS. [CANDIDATE] is known for crisp roadmaps and strong execution.

EXPERIENCE

Senior Product Manager, LedgerLoop (B2B invoicing SaaS), 2021-2025

- Led the roadmap for the invoicing suite; took full ownership of 6 features from spec to release.

- Ran 50+ user interviews across 9 enterprise accounts to shape the approvals workflow.

- Managed competing stakeholder priorities across customer success, sales and engineering.

- Managed QA handoff, release communication and post-launch tracking for the v3 launch.

- Grew the product team by hiring and onboarding 3 PMs and a designer.

Product Manager, CartNest (e-commerce), 2017-2021

- Redesigned checkout, improving conversion by 11%.

- Owned external agency management for the mobile app redesign.

- Patched and deployed a coupon bug fix within 24 hours; average P1 time-to-resolve 30 minutes.

EDUCATION

B.Tech, Computer Science, VIT Vellore, 2016
```
</details>

### PM: 33.3 / 100

| # | Criterion | Wt | Score | Reason |
|---|---|---|---|---|
| 1 | Got a yes from someone they couldn't instruct | 34 | 1 | "Ran 50+ user interviews across 9 enterprise accounts" involves outside contacts, but as information-gathering research, no one had to agree to anything. |
| 2 | Stayed the named contact until closure | 27 | 1 | "took full ownership of 6 features from spec to release" describes an output but lacks a specific duration and a continuous contact role. |
| 3 | Caught the disruption before the customer felt it | 24 | 1 | "Patched and deployed a coupon bug fix within 24 hours" describes an unplanned fix but only states internal resolution time, missing the downstream harm avoided. |
| 4 | Fixed it with what was already in the room | 15 | 1 | "Patched and deployed a coupon bug fix within 24 hours" is a disruption bullet but says nothing about how the fix was resourced. |

**Interview brief (PM):** The candidate's strongest evidence is for catching a disruption before the customer felt it, citing the CV line "Patched and deployed a coupon bug fix within 24 hours" which shows an unplanned trigger but misses the downstream harm avoided. The weakest criterion is getting a yes from someone they couldn't instruct, because the CV lacks any example of asking a named outside organization for a specific action and what they did as a result. Can you describe a time you had to ask a named outside organization, such as a client's department or a regulator, for a specific action, and what exactly they did as a result?

### SPM: 24.7 / 100

| # | Criterion | Wt | Score | Reason |
|---|---|---|---|---|
| 1 | Got a yes from someone they couldn't instruct | 26 | 0 | No instance found. |
| 2 | Stayed the named contact until closure | 35 | 1 | "Managed QA handoff, release communication and post-launch tracking" covers both sides but is internal only, lacking an outside party kept informed throughout. |
| 3 | Caught the disruption before the customer felt it | 21 | 1 | "Patched and deployed a coupon bug fix within 24 hours" describes an unplanned fix but only gives internal metrics, not the harm avoided for downstream customers. |
| 4 | Fixed it with what was already in the room | 18 | 1 | "Patched and deployed a coupon bug fix within 24 hours" describes a disruption but says nothing about how the response was resourced. |

**Interview brief (SPM):** The candidate's strongest evidence for staying the named contact until closure is their claim that they "managed QA handoff, release communication and post-launch tracking for the v3 launch," which demonstrates handling internal coordination and follow-up. The weakest area is getting a yes from someone they couldn't instruct, as the CV completely lacks any examples of persuading an outside organization to agree to a request. Can you describe a specific instance where you identified an issue ahead of time and successfully persuaded an outside organization to agree to your request, including exactly what you asked for and what failure would have cost?

### Email draft: rejection

**Subject:** Your application to Kargo

```
Hi Karan,

Thank you for taking the time to apply for the Senior Product Manager role at Kargo. I really enjoyed reviewing your experience. Your work at LedgerLoop leading the roadmap for the invoicing suite and conducting extensive user interviews across enterprise accounts is genuinely impressive. It is also great to see your earlier success at CartNest, particularly how you improved checkout conversion by 11 percent. While your background in B2B SaaS is strong, we have decided not to move forward with your application for this specific position. We truly appreciate your interest in what we are building here at Kargo. I wish you the absolute best in your job search and all your future professional endeavors.

Best,
Founder, Kargo
Mumbai
```

---

## Farah Sheikh: applied PM (`farah-sheikh-pm.pdf`)

**Personal details separated (never sent to AI):**

name=Farah Sheikh · email=farah.sheikh91@yahoo.in · phone=+91 90040 55219 · linkedin=- · github=- · other urls=https://farahsheikh.in, farahsheikh.in/work · address=Andheri East, Mumbai 400069

<details><summary>Redacted CV text (exactly what the AI saw)</summary>

```
[CANDIDATE]
[EMAIL] | [PHONE] | [URL]
[ADDRESS]
ABOUT
Product manager with a logistics operations background. Portfolio: [URL]
EXPERIENCE
Product Manager, PortPulse Technologies (2022-2025)
- Coordinated daily with shipping lines, CFS operators and port authorities on container status data feeds.
- Led onboarding for new freight-forwarder accounts on the tracking platform.
- When our main AIS data vendor had a 2-day outage, switched ETA feeds to a backup provider; no client ETAs were
missed.
Operations Analyst, Transocean Cargo (2019-2022)
- Negotiated with a regional trucking association to settle a 3-month detention dispute; client recovered INR 6 lakh.
- Built weekly MIS reports for the branch head.
EDUCATION
BMS, Mithibai College, Mumbai, 2019
```
</details>

### PM: 43.7 / 100

| # | Criterion | Wt | Score | Reason |
|---|---|---|---|---|
| 1 | Got a yes from someone they couldn't instruct | 34 | 2 | "Negotiated with a regional trucking association to settle a 3-month detention dispute; client recovered INR 6 lakh" shows an outside party agreeing to settle a dispute with a financial result. |
| 2 | Stayed the named contact until closure | 27 | 0 | No instance found. |
| 3 | Caught the disruption before the customer felt it | 24 | 2 | "When our main AIS data vendor had a 2-day outage... no client ETAs were missed" clearly identifies an unplanned trigger and the downstream harm avoided for clients. |
| 4 | Fixed it with what was already in the room | 15 | 1 | "switched ETA feeds to a backup provider" describes fixing a disruption but lacks details on whether it was done outside planned time or without added resources. |

**Interview brief (PM):** The candidate's strongest evidence is for getting a yes from someone they couldn't instruct, as seen when they "negotiated with a regional trucking association to settle a 3-month detention dispute; client recovered INR 6 lakh." The weakest area is staying the named contact until closure, because the resume lacks any example detailing the duration of an episode, its end point, and the candidate's specific role throughout that period. Can you describe a specific operational episode you managed, detailing exactly how long it lasted, what the final resolution was, and your specific role in communicating with stakeholders throughout that entire timeframe?

### SPM: 37.3 / 100

| # | Criterion | Wt | Score | Reason |
|---|---|---|---|---|
| 1 | Got a yes from someone they couldn't instruct | 26 | 2 | "Negotiated with a regional trucking association to settle a 3-month detention dispute; client recovered INR 6 lakh" meets the PM strong bar but lacks a second episode for the SPM bar. |
| 2 | Stayed the named contact until closure | 35 | 0 _(model said 1; capped: PM bar not met)_ | "Led onboarding for new freight-forwarder accounts" describes an activity but lacks a duration and closing event, meeting the PM weak form. |
| 3 | Caught the disruption before the customer felt it | 21 | 2 | "When our main AIS data vendor had a 2-day outage... no client ETAs were missed" names an outside origin and harm avoided for a downstream party, meeting SPM strong once. |
| 4 | Fixed it with what was already in the room | 18 | 1 | The "2-day outage" bullet describes an unplanned disruption but says nothing about how the fix was resourced, meeting the PM weak form. |

**Interview brief (SPM):** The candidate's strongest evidence is for catching a disruption before the customer felt it, as seen when they state, "When our main AIS data vendor had a 2-day outage, switched ETA feeds to a backup provider; no client ETAs were missed." The weakest criterion is staying the named contact until closure, because the CV mentions leading onboarding for new freight-forwarder accounts but lacks a specific duration and a definitive closing event. When you led onboarding for new freight-forwarder accounts, what was the specific duration of the process, and what was the final closing act you personally handled to ensure the onboarding was complete?

### Email draft: rejection

**Subject:** Your application to Kargo

```
Hi Farah,

Thank you for taking the time to apply for the Product Manager position at Kargo. I enjoyed reviewing your background, particularly your work at PortPulse Technologies. It is genuinely impressive how you managed the AIS data vendor outage by swiftly switching ETA feeds to a backup provider so that no client ETAs were missed. Your earlier experience negotiating the detention dispute at Transocean Cargo also stands out as a strong example of your operational problem-solving skills.

While your background in logistics operations is commendable, we have decided not to move forward with your application for this role. I appreciate your interest in what we are building here at Kargo. I wish you the absolute best in your job search and all your future professional endeavors.

Best,
Founder, Kargo
Mumbai
```
