// Four fictional CVs written to clear the line: for testing uploads end to end.
// All people, companies' internal details, numbers and contact details are invented.
//   npx tsx scripts/make-pass-cvs.ts   ->  test-cvs/*.pdf|docx
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { docx, pdf } from './make-sample-cvs'

const OUT = path.resolve(import.meta.dirname, '../test-cvs')

export const PASS_CVS: { file: string; role: 'pm' | 'spm'; lines: string[] }[] = [
  {
    file: '01_meera_iyer_pm.pdf',
    role: 'pm',
    lines: [
      'MEERA IYER',
      'Product Manager | Mumbai',
      'meera.iyer@example.com | +91 90000 11001 | linkedin.com/in/meera-iyer-pm',
      '',
      'SUMMARY',
      'Product manager with 6 years in freight forwarding operations and logistics software. Moved from running export desks to owning the shipment-visibility product.',
      '',
      'EXPERIENCE',
      'Product Manager, SeaBridge Logistics Tech, Mumbai (2022 - Present)',
      '- Negotiated with Maersk Line and Hapag-Lloyd to waive INR 14 lakh of detention charges for a pharma client after documenting repeated free-time breaches; both carriers credited the full amount within 30 days.',
      '- Was the single point of contact for a new FMCG client\'s onboarding across their procurement, warehousing and finance teams over 9 weeks, until the first 60 containers moved on schedule.',
      '- Wrote the PRD for the exception-alerts module used by 140 shippers; shipped with engineering in two releases.',
      'Operations Lead, Coastline Freight Pvt Ltd, Navi Mumbai (2019 - 2022)',
      '- When JNPT customs placed a 9pm hold on a pharma export consignment, coordinated directly with the CHA and the appraising officer through the night; the hold was cleared by 5am and the shipment made its vessel cut-off before the client knew.',
      '- Through a 4-month peak season with documentation volume up 55%, redesigned shift handovers and the document checklist with no additional headcount; no client shipments missed their cut-off.',
      '',
      'EDUCATION',
      'MBA (Operations), NMIMS Mumbai, 2019. B.Com, University of Mumbai, 2016.',
      '',
      'SKILLS',
      'Customs documentation (ICEGATE), carrier management, SQL, Jira, product discovery',
    ],
  },
  {
    file: '02_arvind_menon_spm.pdf',
    role: 'spm',
    lines: [
      'ARVIND MENON',
      'Senior Product Manager | Bengaluru',
      'arvind.menon@example.com | +91 90000 22002 | linkedin.com/in/arvind-menon-logistics',
      '',
      'SUMMARY',
      'Senior product lead with 10 years across freight operations and logistics SaaS. Owns outside relationships end to end and builds processes that outlast the incident.',
      '',
      'EXPERIENCE',
      'Senior Product Manager, CargoLens (logistics SaaS), Bengaluru (2020 - Present)',
      '- Set up a quarterly carrier scorecard for the first time at the company after identifying on-time drift; used it to renegotiate rates with 3 shipping lines (average 11% reduction), keeping a INR 2 Cr/year client that had flagged freight costs as a reason to leave.',
      '- Ahead of a DGFT inspection, audited a key exporter client\'s documentation, found and fixed 6 gaps in advance; the client passed with no observations raised, avoiding penalties and a held licence.',
      '- After a 5-hour tracking-platform outage, wrote the internal incident report and the customer-facing update, ran the retrospective with engineering, and owned all 9 follow-up actions to closure over the next 6 weeks.',
      '- Ran a 12-week rollout for a national retail client as their named contact across logistics, IT and finance; after go-live, monitored the first 30 days and closed every open issue.',
      '- When our AIS data vendor changed its API without notice, switched ETA feeds to a backup provider over a weekend; no client ETAs were missed for 40 shipments in transit.',
      '- During an 18-month volume surge (shipments up 70%), redesigned exception triage with the existing 5-person ops team and no additional headcount; the new triage process was retained permanently and adopted by two other regions.',
      'Product Manager, PortLink Freight, Chennai (2016 - 2020)',
      '- When a Chennai port strike stranded 120 containers, negotiated priority berthing with the terminal operator and rerouted 30 boxes via Krishnapatnam; every client shipment met its delivery window.',
      '- Covered a departing account manager\'s book of 7 enterprise accounts for 3 months without additional headcount; no churn during that period.',
      '',
      'EDUCATION',
      'MBA, IIM Kozhikode, 2016. B.E. Mechanical, Anna University, 2013.',
    ],
  },
  {
    // Name block at the END, glued and duplicated, like many designed templates.
    file: '03_kavya_reddy_pm.pdf',
    role: 'pm',
    lines: [
      'Hyderabad, Telangana, India',
      'SUMMARY',
      'Fintech product manager with 6 years building lending and payments products for banks and NBFCs. Strong at regulator and partner work, and at keeping launches safe for customers.',
      '',
      'EXPERIENCE',
      'Product Manager, LendStack (lending SaaS), Hyderabad (2021 - Present)',
      '- Secured RBI approval for a co-lending product: prepared the compliance pack and presented it to the regulator\'s fintech department; approved in 10 weeks, unlocking 2 bank partners.',
      '- Renegotiated API pricing with Razorpay using 12 months of volume data, cutting payment costs by 18%.',
      '- Was the point of contact for a 14-week implementation with a large NBFC client\'s risk, operations and IT teams until go-live, then monitored the first 30 days of live lending.',
      '- When a credit-bureau partner\'s API went down for 6 hours at month-end, switched decisioning to cached reports; zero disbursements were delayed for 3 lending clients.',
      '- Automated loan-reconciliation exceptions with the existing 4-person team over two weekends; no new hires, and the process was adopted permanently.',
      'Associate Product Manager, PayGrid, Bengaluru (2019 - 2021)',
      '- Shipped UPI autopay mandates for 40 merchant clients; ran the merchant beta and closed all launch issues.',
      '',
      'EDUCATION',
      'B.Tech, Computer Science, IIIT Hyderabad, 2019',
      'KAVYA REDDYKavya Reddy',
      'kavya.reddy@example.com +91 90000 3300390000 33003 kavya-reddy-pm',
    ],
  },
  {
    file: '04_rohit_bansal_spm.docx',
    role: 'spm',
    lines: [
      'Rohit Bansal',
      'Senior Product Manager, Supply Chain | Gurugram',
      'rohit.bansal@example.com | +91 90000 44004 | github.com/rohit-bansal',
      '',
      'PROFILE',
      'Senior PM with 9 years in quick-commerce and e-commerce supply chain. Runs outside partnerships and incident response end to end.',
      '',
      'EXPERIENCE',
      'Senior Product Manager, Supply Chain, ZipCart (quick commerce), Gurugram (2021 - Present)',
      '- Built a supplier fill-rate scorecard for the first time after identifying stockouts in 22 dark stores; used it to renegotiate terms with 4 FMCG distributors, raising fill rate from 81% to 95% and avoiding INR 3 Cr a quarter in lost orders.',
      '- Ahead of a Legal Metrology inspection, reviewed labelling across 1,800 SKUs with 3 suppliers and fixed 140 issues in advance; all stores passed with no penalties.',
      '- When a cold-chain logistics partner lost 9 trucks to a breakdown before Diwali, negotiated emergency capacity with two regional carriers within 24 hours; every dairy and frozen order was delivered on time.',
      '- Owned the post-mortem after a 3-hour order-routing outage: wrote the engineering report and the customer and partner communications, ran the retrospective, and closed all 11 follow-ups over 5 weeks.',
      '- Led the 16-week launch of 12 dark stores in Pune as the named contact for landlords, distributors and the city team; monitored the first 60 days after opening.',
      '- Through a 6-month demand surge, redesigned picking waves with the existing store teams and no additional headcount; the wave design became the standard across 140 stores.',
      'Product Manager, ShopRite Online, Bengaluru (2016 - 2021)',
      '- When a 3PL partner\'s warehouse system failed during a sale, moved returns processing to two in-house hubs overnight; no customer refunds were delayed.',
      '',
      'EDUCATION',
      'MBA, FMS Delhi, 2016. B.Tech, Delhi Technological University, 2014.',
    ],
  },
]

mkdirSync(OUT, { recursive: true })
for (const cv of PASS_CVS) {
  writeFileSync(path.join(OUT, cv.file), cv.file.endsWith('.pdf') ? await pdf(cv.lines) : await docx(cv.lines))
  console.log(path.join(OUT, cv.file))
}
